"""Local-only account consent and review. Source authors are never reassigned."""
from contextlib import contextmanager
from datetime import timedelta, timezone
import re
import time
from uuid import UUID
from psycopg.types.json import Jsonb
from .discord import DiscordError
from .reconcile import base_permissions, ADMIN, MANAGE_GUILD

ACTIVE = ('awaiting_consent', 'pending_review', 'approved')
MESSAGES = {
    'permission_denied': '이 기능을 사용할 권한이 없어요.',
    'not_participant': '본인이 관련된 요청만 확인할 수 있어요.',
    'invalid_member': '이 서버의 일반 사용자 계정만 연결할 수 있어요.',
    'account_busy': '해당 계정에 진행 중인 요청이 있어요.',
    'request_changed': '요청 상태가 바뀌었어요. 현황을 다시 확인해 주세요.',
    'request_expired': '요청 기간이 지났어요. 다시 신청해 주세요.',
    'preview_changed': '기록이 바뀌었어요. 영향을 다시 확인해 주세요.',
    'preview_required': '승인 전에 영향을 먼저 확인해 주세요.',
    'discord_unavailable': '멤버 정보를 확인하지 못했어요. 잠시 뒤 다시 이용해 주세요.',
    'feature_disabled': '계정 연결을 아직 준비하고 있어요.',
    'invalid_request': '요청을 확인하지 못했어요.',
    'already_linked': '이미 같은 잔디로 연결된 계정이에요.',
    'primary_required': '대표 계정에서 연결을 신청해 주세요.',
    'group_merge_unsupported': '이미 연결된 계정 그룹끼리는 합칠 수 없어요.',
    'expired_action': '처리 시간이 지났어요. 현황을 확인한 뒤 다시 이용해 주세요.',
}


class AccountError(Exception):
    pass


def numeric(value):
    return isinstance(value, str) and bool(re.fullmatch(r'\d{1,22}', value))


def button(kind, request_id, version, label, style=2):
    return {'type': 2, 'style': style, 'label': label[:80],
            'custom_id': f'mukmuk-account:{kind}:{request_id}:{version}'}


def components(buttons):
    return [{'type': 1, 'components': buttons[i:i+5]} for i in range(0, min(len(buttons), 25), 5)]


# Navigation buttons carry no request; list views treat the nil id as "from the start".
NIL = '00000000-0000-0000-0000-000000000000'


def nav(kind, label):
    return button(kind, NIL, 0, label)


def select(kind, placeholder, options=None):
    menu = {'type': 3 if options else 5, 'custom_id': f'mukmuk-account:{kind}:{NIL}:0',
            'placeholder': placeholder, 'min_values': 1, 'max_values': 1}
    if options:
        menu['options'] = options[:25]
    return {'type': 1, 'components': [menu]}


class AccountService:
    def __init__(self, store, api, settings, runtime_guard=None):
        self.store, self.api, self.settings = store, api, settings
        self.guild = settings['DISCORD_GUILD_ID']
        self.runtime_guard = runtime_guard

    @contextmanager
    def transaction(self):
        if hasattr(self.store, 'session'):
            with self.store.session() as store:
                with store.transaction():
                    yield store.conn
        else:
            with self.store.transaction():
                yield self.store.conn

    def _member(self, user_id, deadline):
        if not numeric(user_id):
            raise AccountError('invalid_member')
        member = self.api.once('GET', f'/guilds/{self.guild}/members/{user_id}', deadline)
        if (not isinstance(member, dict) or not isinstance(member.get('user'), dict)
                or member['user'].get('id') != user_id or not isinstance(member.get('roles'), list)):
            raise DiscordError('invalid_member_response')
        if member['user'].get('bot'):
            raise AccountError('invalid_member')
        return member

    def _identity(self, member, roles, owner):
        value = base_permissions(member, roles, self.guild, owner)
        manager = bool(value & (ADMIN | MANAGE_GUILD))
        allowed = manager or bool(self.settings.get('DISCORD_ROLE_MEMBER_ID') in member.get('roles', []))
        if not allowed:
            raise AccountError('permission_denied')
        return manager

    def _verify(self, action, deadline):
        guild = self.api.once('GET', f'/guilds/{self.guild}', deadline)
        roles = self.api.once('GET', f'/guilds/{self.guild}/roles', deadline)
        if guild.get('id') != self.guild or not isinstance(roles, list):
            raise AccountError('invalid_member')
        actor = self._member(action['actor_id'], deadline)
        manager = self._identity(actor, roles, guild.get('owner_id'))
        people = {action['actor_id']: actor}
        request = None
        # Request rows are re-read under the write lock before any transition.
        if action.get('request_id') and action['kind'] not in ('status', 'review_list'):
            request = self._find(action['request_id'])
            if action['kind'].startswith('review') or action['kind'] in ('approve', 'reject'):
                if not manager:
                    raise AccountError('permission_denied')
            elif action['actor_id'] not in (request['primary_user_id'], request['target_user_id']):
                raise AccountError('not_participant')
            needs_parties = action['kind'] in ('consent', 'review_detail', 'approve') and request['status'] in ACTIVE
            ids = (request['primary_user_id'], request['target_user_id']) if needs_parties else ()
        else:
            ids = (action.get('target_id'),) if action.get('target_id') else ()
        for uid in ids:
            if uid not in people:
                try:
                    member = self._member(uid, deadline)
                    self._identity(member, roles, guild.get('owner_id'))
                    people[uid] = member
                except AccountError:
                    if request:
                        return manager, people, True
                    raise
                except DiscordError as error:
                    if request and error.status == 404:
                        return manager, people, True
                    raise
        return manager, people, False

    def _find(self, request_id, lock=False):
        try:
            value = UUID(str(request_id))
        except (ValueError, TypeError):
            raise AccountError('invalid_request') from None
        with self.transaction() as db:
            query = 'SELECT * FROM solitary_athlete.mukmuk_account_link_requests WHERE id=%s'
            row = db.execute(query+(' FOR UPDATE' if lock else ''), (value,)).fetchone()
            if not row or row['guild_id'] != self.guild:
                raise AccountError('invalid_request')
            return row

    def _state(self, db):
        return db.execute('SELECT * FROM solitary_athlete.mukmuk_identity_state WHERE singleton').fetchone()

    def _group(self, db, user_id):
        row = db.execute('''SELECT p.person_id,p.primary_user_id FROM solitary_athlete.mukmuk_person_accounts a
          JOIN solitary_athlete.mukmuk_people p USING(person_id) WHERE a.user_id=%s AND a.valid_until IS NULL''', (user_id,)).fetchone()
        if row is None:
            raise AccountError('invalid_member')
        members = db.execute('SELECT user_id FROM solitary_athlete.mukmuk_person_accounts WHERE person_id=%s AND valid_until IS NULL ORDER BY user_id', (row['person_id'],)).fetchall()
        return {'person_id': str(row['person_id']), 'primary_user_id': row['primary_user_id'],
                'accounts': [r['user_id'] for r in members]}

    def _fingerprint(self, db, primary, target):
        return {'primary': self._group(db, primary), 'target': self._group(db, target)}

    def _ensure(self, db, member):
        user = member['user']
        name = member.get('nick') or user.get('global_name') or user.get('username') or '운동가'
        db.execute('SELECT solitary_athlete.mukmuk_ensure_person(%s,%s,%s)', (user['id'], name, self.guild))

    def _expire(self, db):
        db.execute("""UPDATE solitary_athlete.mukmuk_account_link_requests SET status='expired',version=version+1
          WHERE status IN ('awaiting_consent','pending_review') AND expires_at<=clock_timestamp()""")

    def _move(self, db, request, revision):
        target = request['target_user_id']
        if request['kind'] == 'link':
            person = request['person_id']
        else:
            person = db.execute('SELECT person_id FROM solitary_athlete.mukmuk_people WHERE primary_user_id=%s', (target,)).fetchone()['person_id']
        db.execute('UPDATE solitary_athlete.mukmuk_person_accounts SET valid_until=%s WHERE user_id=%s AND valid_until IS NULL', (revision, target))
        db.execute('INSERT INTO solitary_athlete.mukmuk_person_accounts(guild_id,user_id,person_id,valid_from) VALUES(%s,%s,%s,%s)', (self.guild, target, person, revision))

    def _counts(self, db, revision, today):
        rows = db.execute('''SELECT count(DISTINCT person_id)::integer AS members,count(*)::integer AS days
          FROM solitary_athlete.mukmuk_person_days(%s,%s,%s)''', (revision, today.replace(day=1), today+timedelta(days=1))).fetchone()
        total = db.execute('SELECT count(DISTINCT person_id)::integer AS n FROM solitary_athlete.mukmuk_person_days(%s)', (revision,)).fetchone()['n']
        return {**rows, 'elapsed_days': today.day, 'rate': rows['days']/(rows['members']*today.day)*100 if rows['members'] else 0,
                'total_members': total}

    def _preview(self, db, request):
        state = self._state(db)
        today = db.execute("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date AS day").fetchone()['day']
        current = self._counts(db, state['revision'], today)
        with db.transaction(force_rollback=True):
            self._move(db, request, state['revision']+1)
            proposed = self._counts(db, state['revision']+1, today)
        return {'current': current, 'proposed': proposed}

    def _notice(self, request, actor, manager=False, impact=None, admin=False):
        status = request['status']
        names = {'awaiting_consent': '상대 계정의 동의를 기다리고 있어요.', 'pending_review': '관리자 검토를 기다리고 있어요.',
                 'approved': '승인됐어요. 다음 성공 수집에서 기록과 통계에 함께 반영해요.', 'applied': '계정 변경이 반영됐어요.',
                 'rejected': '요청이 거절됐어요.', 'cancelled': '요청이 취소됐어요.', 'expired': '요청 기간이 지났어요.',
                 'invalidated': '계정 구성이나 자격이 바뀌어 다시 신청해야 해요.', 'failed': '처리를 마치지 못했어요. 다시 신청해 주세요.'}
        operation = '계정 연결' if request['kind'] == 'link' else '계정 해제'
        text = f"{operation} 요청 · {names[status]}\n요청 {request['id']}\n대표 <@{request['primary_user_id']}> · 대상 <@{request['target_user_id']}>"
        def consent_time(value):
            return value.astimezone(timezone(timedelta(hours=9))).strftime('%Y-%m-%d %H:%M KST') if value else '대기 중'
        text += '\n신청 계정 동의 · '+consent_time(request['requester_consented_at'])
        if request['kind'] == 'link':
            text += '\n상대 계정 동의 · '+consent_time(request['target_consented_at'])
        else:
            text += '\n해제는 당사자 한쪽이 신청하며, 상대 계정의 추가 동의 없이 관리자가 검토해요.'
        if status == 'rejected' and request.get('rejection_reason'):
            reason = re.sub(r'[\r\n]+', ' ', request['rejection_reason'])
            reason = re.sub(r'([\\`*_~|>\[\]()])', r'\\\1', reason)
            text += '\n거절 사유 · '+reason
        if status == 'awaiting_consent':
            text += '\n상대 계정에서도 /계정연결로 현황을 열어 동의해 주세요.'
        choices = []
        if status == 'awaiting_consent' and actor == request['target_user_id']:
            choices.extend([button('consent', request['id'], request['version'], '동의', 1), button('decline', request['id'], request['version'], '거절')])
        if status in ('awaiting_consent', 'pending_review') and actor in (request['primary_user_id'], request['target_user_id']):
            choices.append(button('cancel', request['id'], request['version'], '요청 취소'))
        if manager and status == 'pending_review':
            choices.extend([button('review_detail', request['id'], request['version'], '영향 다시 확인'),
                            button('approve', request['id'], request['version'], '승인', 1),
                            button('reject_modal', request['id'], request['version'], '거절', 4)])
        if manager:
            choices.append(nav('review_list', '목록으로'))
        else:
            if admin and status == 'pending_review':
                choices.append(button('review_detail', request['id'], request['version'], '검토하기', 1))
            elif admin:
                choices.append(nav('review_list', '검토 목록'))
            choices.append(nav('status', '현황으로'))
        result = {'content': text[:1700], 'components': components(choices), 'request_id': str(request['id']),
                  'status': status, 'version': request['version']}
        if impact:
            result['impact'] = impact
            a, b = impact['current'], impact['proposed']
            result['content'] += f"\n월간 {a['members']}명·{a['days']}칸·{a['rate']:.1f}% → {b['members']}명·{b['days']}칸·{b['rate']:.1f}%\n전체 인증 이력 {a['total_members']}명 → {b['total_members']}명\n원본과 지난 날짜의 관측값은 보존해요."
        return result

    def _create(self, db, action, people, admin=False):
        actor, target = action['actor_id'], action.get('target_id')
        if not numeric(target) or (actor == target and action['kind'] != 'unlink'):
            raise AccountError('invalid_member')
        for member in people.values():
            self._ensure(db, member)
        own = self._group(db, actor)
        other = self._group(db, target)
        unlink = action['kind'] == 'unlink'
        primary = own['primary_user_id']
        if unlink:
            if own['person_id'] != other['person_id'] or target == primary or actor not in (primary, target):
                raise AccountError('invalid_request')
        else:
            if primary != actor:
                raise AccountError('primary_required')
            if own['person_id'] == other['person_id']:
                raise AccountError('already_linked')
            if len(other['accounts']) != 1 or other['primary_user_id'] != target:
                raise AccountError('group_merge_unsupported')
        existing = db.execute('''SELECT * FROM solitary_athlete.mukmuk_account_link_requests WHERE status=ANY(%s)
          AND (primary_user_id=ANY(%s) OR target_user_id=ANY(%s)) ORDER BY created_at LIMIT 1''', (list(ACTIVE), [primary, target], [primary, target])).fetchone()
        if existing:
            if existing['primary_user_id'] == primary and existing['target_user_id'] == target and existing['kind'] == ('unlink' if unlink else 'link'):
                return self._notice(existing, actor, admin=admin)
            raise AccountError('account_busy')
        request = db.execute('''INSERT INTO solitary_athlete.mukmuk_account_link_requests
          (creation_interaction_id,guild_id,kind,requester_id,primary_user_id,target_user_id,person_id,group_fingerprint,status)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
          (action['interaction_id'], self.guild, 'unlink' if unlink else 'link', actor, primary, target, own['person_id'],
           Jsonb(self._fingerprint(db, primary, target)), 'pending_review' if unlink else 'awaiting_consent')).fetchone()
        return self._notice(request, actor, admin=admin)

    def _list(self, db, action, manager):
        review = action['kind'] == 'review_list'
        if review and not manager:
            raise AccountError('permission_denied')
        after = action.get('request_id')
        if after:
            try:
                UUID(str(after))
            except ValueError:
                raise AccountError('invalid_request') from None
        # Status keeps rows free for the link/unlink menus; Discord allows five rows.
        limit = 10 if review else 5
        rows = db.execute('''SELECT * FROM solitary_athlete.mukmuk_account_link_requests
          WHERE guild_id=%s AND (%s OR primary_user_id=%s OR target_user_id=%s)
          AND (%s IS FALSE OR status IN ('pending_review','approved','failed'))
          AND (%s::uuid IS NULL OR id>%s::uuid) ORDER BY id LIMIT %s''',
          (self.guild, review, action['actor_id'], action['actor_id'], review, after, after, limit+1)).fetchall()
        labels = {'awaiting_consent':'동의 대기','pending_review':'검토 대기','approved':'반영 대기','applied':'반영 완료','rejected':'거절','cancelled':'취소','expired':'만료','invalidated':'재신청 필요','failed':'처리 오류'}
        buttons = [button('review_detail' if review else 'detail', r['id'], r['version'], f"{'연결' if r['kind']=='link' else '해제'} · {labels[r['status']]}") for r in rows[:limit]]
        navigation = []
        if len(rows) > limit:
            navigation.append(button('review_list' if review else 'status', rows[limit-1]['id'], 0, '다음 요청'))
        text = '검토할 계정 요청이에요.' if review else '내 계정 연결 현황이에요.'
        menus = []
        if review:
            navigation.append(nav('status', '내 현황'))
        else:
            if manager:
                navigation.append(nav('review_list', '검토 목록'))
            account = db.execute('''SELECT p.primary_user_id,a.user_id,own.username FROM solitary_athlete.mukmuk_person_accounts a
              JOIN solitary_athlete.mukmuk_people p USING(person_id)
              LEFT JOIN solitary_athlete.mukmuk_people own ON own.primary_user_id=a.user_id
              WHERE a.valid_until IS NULL AND a.person_id=(
              SELECT person_id FROM solitary_athlete.mukmuk_person_accounts WHERE user_id=%s AND valid_until IS NULL) ORDER BY a.user_id''', (action['actor_id'],)).fetchall()
            primary = account[0]['primary_user_id'] if account else action['actor_id']
            if account:
                text += '\n대표 <@'+primary+'>\n연결 계정 '+', '.join('<@'+a['user_id']+'>' for a in account)
            if primary == action['actor_id']:
                menus.append(select('request_select', '연결할 계정 선택'))
            # Same rule as _create: the primary detaches any alt, an alt only itself.
            detachable = [a for a in account if a['user_id'] != primary and action['actor_id'] in (primary, a['user_id'])]
            if detachable:
                menus.append(select('unlink_select', '해제할 계정 선택',
                                    [{'label': (a['username'] or '연결 계정')[:100], 'value': a['user_id']} for a in detachable]))
        if not rows:
            text += '\n진행 중인 요청이 없어요.'
        return {'content': text[:1900], 'components': components(buttons) + components(navigation) + menus}

    def _perform(self, db, action, manager, people, party_ineligible=False):
        if not self._state(db)['enabled']:
            raise AccountError('feature_disabled')
        for member in people.values():
            self._ensure(db, member)
        kind, actor = action['kind'], action['actor_id']
        if kind in ('request', 'unlink'):
            return self._create(db, action, people, manager)
        if kind in ('status', 'review_list'):
            return self._list(db, action, manager)
        request = self._find(action.get('request_id'), lock=True)
        if kind in ('review_detail', 'approve', 'reject'):
            if not manager:
                raise AccountError('permission_denied')
        elif actor not in (request['primary_user_id'], request['target_user_id']):
            raise AccountError('not_participant')
        if request['status'] == 'expired':
            raise AccountError('request_expired')
        if self._fingerprint(db, request['primary_user_id'], request['target_user_id']) != request['group_fingerprint'] and request['status'] in ACTIVE:
            db.execute("UPDATE solitary_athlete.mukmuk_account_link_requests SET status='invalidated',version=version+1 WHERE id=%s", (request['id'],))
            return self._notice(self._find(request['id']), actor, admin=manager)
        if party_ineligible and request['status'] in ACTIVE:
            db.execute("UPDATE solitary_athlete.mukmuk_account_link_requests SET status='invalidated',version=version+1,lease_until=NULL,error_code='participant_ineligible' WHERE id=%s", (request['id'],))
            return self._notice(self._find(request['id']), actor, admin=manager)
        if kind == 'detail':
            return self._notice(request, actor, admin=manager)
        if kind == 'review_detail':
            impact = self._preview(db, request) if request['status'] == 'pending_review' else None
            if impact:
                state = self._state(db)
                db.execute('''INSERT INTO solitary_athlete.mukmuk_account_reviews
                  (request_id,reviewer_id,request_version,identity_revision,source_revision,impact)
                  VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(request_id,reviewer_id) DO UPDATE SET
                  request_version=EXCLUDED.request_version,identity_revision=EXCLUDED.identity_revision,
                  source_revision=EXCLUDED.source_revision,impact=EXCLUDED.impact,created_at=clock_timestamp()''',
                  (request['id'], actor, request['version'], state['revision'], state['source_revision'], Jsonb(impact)))
            return self._notice(request, actor, manager=True, impact=impact)
        if action.get('version') != request['version']:
            raise AccountError('request_changed')
        status = request['status']
        if kind == 'consent':
            if status != 'awaiting_consent' or actor != request['target_user_id']:
                raise AccountError('request_changed')
            target_status = 'pending_review'
        elif kind in ('cancel', 'decline'):
            if status not in ('awaiting_consent', 'pending_review') or (kind == 'decline' and actor != request['target_user_id']):
                raise AccountError('request_changed')
            target_status = 'cancelled' if kind == 'cancel' else 'rejected'
        elif kind in ('approve', 'reject'):
            if status != 'pending_review':
                raise AccountError('request_changed')
            if kind == 'approve':
                preview = db.execute('SELECT * FROM solitary_athlete.mukmuk_account_reviews WHERE request_id=%s AND reviewer_id=%s', (request['id'], actor)).fetchone()
                if not preview:
                    raise AccountError('preview_required')
                state = self._state(db)
                if (preview['identity_revision'], preview['source_revision'], preview['request_version']) != (state['revision'], state['source_revision'], request['version']):
                    raise AccountError('preview_changed')
                target_status = 'approved'
            else:
                reason = action.get('payload', {}).get('reason')
                if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 200:
                    raise AccountError('invalid_request')
                target_status = 'rejected'
        else:
            raise AccountError('invalid_request')
        request = db.execute('''UPDATE solitary_athlete.mukmuk_account_link_requests SET status=%s,version=version+1,
          target_consented_at=CASE WHEN %s='consent' THEN clock_timestamp() ELSE target_consented_at END,
          reviewer_id=CASE WHEN %s IN ('approve','reject') THEN %s ELSE reviewer_id END,
          reviewed_at=CASE WHEN %s IN ('approve','reject') THEN clock_timestamp() ELSE reviewed_at END,
          approved_at=CASE WHEN %s='approve' THEN clock_timestamp() ELSE approved_at END,
          rejection_reason=CASE WHEN %s='reject' THEN %s ELSE rejection_reason END WHERE id=%s RETURNING *''',
          (target_status, kind, kind, actor, kind, kind, kind, action.get('payload', {}).get('reason'), request['id'])).fetchone()
        return self._notice(request, actor, admin=manager)

    def handle(self, action, deadline):
        if not numeric(action.get('interaction_id')) or not numeric(action.get('actor_id')):
            return {'error_code': 'invalid_request', 'content': MESSAGES['invalid_request']}
        try:
            manager, people, party_ineligible = self._verify(action, deadline)
        except (AccountError, DiscordError, KeyError, TypeError) as error:
            code = str(error) if isinstance(error, AccountError) else 'discord_unavailable'
            return {'error_code': code, 'content': MESSAGES.get(code, MESSAGES['invalid_request'])}
        with self.transaction() as db:
            db.execute("SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'))")
            if self.runtime_guard:
                self.runtime_guard(db)
            self._expire(db)
            prior = db.execute('SELECT * FROM solitary_athlete.mukmuk_account_link_actions WHERE interaction_id=%s FOR UPDATE', (action['interaction_id'],)).fetchone()
            if prior and prior['actor_id'] != action['actor_id']:
                return {'error_code': 'invalid_request', 'content': MESSAGES['invalid_request']}
            if prior and prior['status'] == 'done':
                return prior['result']
            if not prior:
                db.execute('''INSERT INTO solitary_athlete.mukmuk_account_link_actions
                  (interaction_id,actor_id,kind,payload,status) VALUES(%s,%s,%s,%s,'processing')''',
                  (action['interaction_id'], action['actor_id'], action.get('kind', ''), Jsonb(action)))
            try:
                with db.transaction():
                    if time.monotonic() >= deadline:
                        raise AccountError('expired_action')
                    result = self._perform(db, action, manager, people, party_ineligible)
                    if time.monotonic() >= deadline:
                        raise AccountError('expired_action')
                    expired = db.execute('SELECT expires_at<=clock_timestamp() AS expired FROM solitary_athlete.mukmuk_account_link_actions WHERE interaction_id=%s', (action['interaction_id'],)).fetchone()['expired']
                    if expired:
                        raise AccountError('expired_action')
            except AccountError as error:
                code = str(error)
                result = {'error_code': code, 'content': MESSAGES.get(code, MESSAGES['invalid_request'])}
            if self.runtime_guard:
                self.runtime_guard(db)
            db.execute("UPDATE solitary_athlete.mukmuk_account_link_actions SET status='done',result=%s,request_id=%s WHERE interaction_id=%s",
                       (Jsonb(result), result.get('request_id'), action['interaction_id']))
            return result


    def defer_application(self, request, code, delay=60, failure=True, fatal=False):
        with self.transaction() as db:
            db.execute("""UPDATE solitary_athlete.mukmuk_account_link_requests SET
              status=CASE WHEN %s THEN 'invalidated' WHEN failures+%s>=10 THEN 'failed' ELSE status END,
              version=version+CASE WHEN %s OR failures+%s>=10 THEN 1 ELSE 0 END,
              failures=failures+%s,error_code=%s,lease_until=NULL,
              next_attempt_at=clock_timestamp()+%s*interval '1 second'
              WHERE id=%s AND status='approved' AND attempts=%s""",
              (fatal,int(failure),fatal,int(failure),int(failure),code,delay,request['id'],request['attempts']))

    def prepare_apply(self, guard):
        try:
            with self.transaction() as db:
                guard(db)
                request=db.execute("""WITH due AS (
                  SELECT id FROM solitary_athlete.mukmuk_account_link_requests WHERE status='approved'
                  AND next_attempt_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<=clock_timestamp())
                  ORDER BY approved_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
                  UPDATE solitary_athlete.mukmuk_account_link_requests r SET attempts=attempts+1,
                    lease_until=clock_timestamp()+interval '45 seconds'
                  FROM due WHERE r.id=due.id RETURNING r.*""").fetchone()
        except AccountError:
            return None
        if not request:
            return None
        try:
            manager,_,party_ineligible=self._verify({'actor_id':request['reviewer_id'],'kind':'approve','request_id':str(request['id'])},time.monotonic()+30)
            if party_ineligible:
                raise AccountError('invalid_member')
            if not manager:
                raise AccountError('permission_denied')
        except AccountError as error:
            self.defer_application(request,str(error),fatal=True)
            return None
        except DiscordError as error:
            rate=error.status==429
            self.defer_application(request,'member_unavailable',delay=error.retry_after or 60,failure=not rate,fatal=error.status==404)
            return None
        except (KeyError,TypeError):
            self.defer_application(request,'member_unavailable')
            return None
        return ApplyContext(self,request,guard)


class ApplyContext:
    """Fresh REST proof plus an immutable local session guard, used once at success."""
    def __init__(self, service, request, guard):
        self.service, self.request, self.guard = service, request, guard
        self.checked_at = time.monotonic()

    def apply(self, db, now):
        if time.monotonic()-self.checked_at>15:
            raise AccountError('expired_action')
        self.guard(db)
        request=db.execute('''SELECT * FROM solitary_athlete.mukmuk_account_link_requests
          WHERE id=%s AND status='approved' AND version=%s AND attempts=%s
          AND lease_until>clock_timestamp() FOR UPDATE''',
          (self.request['id'],self.request['version'],self.request['attempts'])).fetchone()
        if not request:
            return False
        service=self.service
        if service._fingerprint(db,request['primary_user_id'],request['target_user_id'])!=request['group_fingerprint']:
            db.execute("UPDATE solitary_athlete.mukmuk_account_link_requests SET status='invalidated',version=version+1,lease_until=NULL,error_code='group_changed' WHERE id=%s",(request['id'],))
            return False
        revision=service._state(db)['revision']+1
        service._move(db,request,revision)
        db.execute('UPDATE solitary_athlete.mukmuk_identity_state SET revision=%s',(revision,))
        db.execute('''INSERT INTO solitary_athlete.mukmuk_identity_changes(revision,request_id,reviewer_id,changed_at,change)
          VALUES(%s,%s,%s,%s,%s)''',(revision,request['id'],request['reviewer_id'],now,
          Jsonb({'kind':request['kind'],'before':request['group_fingerprint'],
                 'after':service._fingerprint(db,request['primary_user_id'],request['target_user_id'])})))
        db.execute("""UPDATE solitary_athlete.mukmuk_account_link_requests SET status='applied',applied_at=%s,
          version=version+1,failures=0,lease_until=NULL,error_code=NULL WHERE id=%s""",(now,request['id']))
        return True

    def failed(self, code='storage_failed'):
        self.service.defer_application(self.request,code)
