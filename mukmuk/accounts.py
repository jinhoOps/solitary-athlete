"""Local-only account consent and review. Source authors are never reassigned."""
from contextlib import contextmanager
from datetime import timedelta
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
    'independent_review_required': '본인 계정의 요청은 다른 관리자가 검토해야 해요.',
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


class AccountService:
    def __init__(self, store, api, settings):
        self.store, self.api, self.settings = store, api, settings
        self.guild = settings['DISCORD_GUILD_ID']

    @contextmanager
    def transaction(self):
        method = getattr(self.store, 'transaction', self.store.conn.transaction)
        with method():
            yield self.store.conn

    def _member(self, user_id, deadline):
        if not numeric(user_id):
            raise AccountError('invalid_member')
        member = self.api.once('GET', f'/guilds/{self.guild}/members/{user_id}', deadline)
        if not isinstance(member, dict) or member.get('user', {}).get('id') != user_id or member['user'].get('bot'):
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
        # Request rows are re-read under the write lock before any transition.
        if action.get('request_id'):
            request = self._find(action['request_id'])
            if action['kind'].startswith('review') or action['kind'] in ('approve', 'reject'):
                if not manager:
                    raise AccountError('permission_denied')
            elif action['actor_id'] not in (request['primary_user_id'], request['target_user_id']):
                raise AccountError('not_participant')
            ids = (request['primary_user_id'], request['target_user_id'])
        else:
            ids = (action.get('target_id'),) if action.get('target_id') else ()
        for uid in ids:
            if uid not in people:
                people[uid] = self._member(uid, deadline)
                self._identity(people[uid], roles, guild.get('owner_id'))
        return manager, people

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

    def _independent(self, db, request, actor):
        group = self._group(db, actor)
        involved = self._fingerprint(db, request['primary_user_id'], request['target_user_id'])
        if any(group['person_id'] == entry['person_id'] for entry in involved.values()):
            raise AccountError('independent_review_required')

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

    def _notice(self, request, actor, manager=False, impact=None):
        status = request['status']
        names = {'awaiting_consent': '상대 계정의 동의를 기다리고 있어요.', 'pending_review': '관리자 검토를 기다리고 있어요.',
                 'approved': '승인됐어요. 다음 성공 수집에서 기록과 통계에 함께 반영해요.', 'applied': '계정 변경이 반영됐어요.',
                 'rejected': '요청이 거절됐어요.', 'cancelled': '요청이 취소됐어요.', 'expired': '요청 기간이 지났어요.',
                 'invalidated': '계정 구성이 바뀌어 다시 신청해야 해요.', 'failed': '처리를 마치지 못했어요. 다시 신청해 주세요.'}
        text = f"{names[status]}\n요청 {request['id']}\n대표 <@{request['primary_user_id']}> · 대상 <@{request['target_user_id']}>"
        choices = []
        if status == 'awaiting_consent' and actor == request['target_user_id']:
            choices.extend([button('consent', request['id'], request['version'], '동의', 1), button('decline', request['id'], request['version'], '거절')])
        if status in ('awaiting_consent', 'pending_review') and actor in (request['primary_user_id'], request['target_user_id']):
            choices.append(button('cancel', request['id'], request['version'], '요청 취소'))
        if manager and status == 'pending_review':
            choices.extend([button('review_detail', request['id'], request['version'], '영향 다시 확인'),
                            button('approve', request['id'], request['version'], '승인', 1),
                            button('reject_modal', request['id'], request['version'], '거절', 4)])
        result = {'content': text[:1700], 'components': components(choices), 'request_id': str(request['id']),
                  'status': status, 'version': request['version']}
        if impact:
            result['impact'] = impact
            a, b = impact['current'], impact['proposed']
            result['content'] += f"\n월간 {a['members']}명·{a['days']}칸·{a['rate']:.1f}% → {b['members']}명·{b['days']}칸·{b['rate']:.1f}%\n전체 인증 이력 {a['total_members']}명 → {b['total_members']}명\n원본과 지난 날짜의 관측값은 보존해요."
        return result

    def _create(self, db, action, people):
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
                return self._notice(existing, actor)
            raise AccountError('account_busy')
        request = db.execute('''INSERT INTO solitary_athlete.mukmuk_account_link_requests
          (creation_interaction_id,guild_id,kind,requester_id,primary_user_id,target_user_id,person_id,group_fingerprint,status)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
          (action['interaction_id'], self.guild, 'unlink' if unlink else 'link', actor, primary, target, own['person_id'],
           Jsonb(self._fingerprint(db, primary, target)), 'pending_review' if unlink else 'awaiting_consent')).fetchone()
        return self._notice(request, actor)

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
        rows = db.execute('''SELECT * FROM solitary_athlete.mukmuk_account_link_requests
          WHERE guild_id=%s AND (%s OR primary_user_id=%s OR target_user_id=%s)
          AND (%s IS FALSE OR status IN ('pending_review','approved','failed'))
          AND (%s::uuid IS NULL OR id>%s::uuid) ORDER BY id LIMIT 11''',
          (self.guild, review, action['actor_id'], action['actor_id'], review, after, after)).fetchall()
        buttons = [button('review_detail' if review else 'detail', r['id'], r['version'], f"{'연결' if r['kind']=='link' else '해제'} · {r['status']}") for r in rows[:10]]
        if len(rows) > 10:
            buttons.append(button('review_list' if review else 'status', rows[9]['id'], 0, '다음 요청'))
        text = '검토할 계정 요청이에요.' if review else '내 계정 연결 현황이에요.'
        if not review:
            account = db.execute('''SELECT p.primary_user_id,a.user_id FROM solitary_athlete.mukmuk_person_accounts a
              JOIN solitary_athlete.mukmuk_people p USING(person_id) WHERE a.valid_until IS NULL AND a.person_id=(
              SELECT person_id FROM solitary_athlete.mukmuk_person_accounts WHERE user_id=%s AND valid_until IS NULL) ORDER BY a.user_id''', (action['actor_id'],)).fetchall()
            if account:
                text += '\n대표 <@'+account[0]['primary_user_id']+'>\n연결 계정 '+', '.join('<@'+a['user_id']+'>' for a in account)
        if not rows:
            text += '\n진행 중인 요청이 없어요.'
        return {'content': text[:1900], 'components': components(buttons)}

    def _perform(self, db, action, manager, people):
        if not self._state(db)['enabled']:
            raise AccountError('feature_disabled')
        for member in people.values():
            self._ensure(db, member)
        kind, actor = action['kind'], action['actor_id']
        if kind in ('request', 'unlink'):
            return self._create(db, action, people)
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
            return self._notice(self._find(request['id']), actor)
        if kind == 'detail':
            return self._notice(request, actor)
        if kind == 'review_detail':
            self._independent(db, request, actor)
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
            self._independent(db, request, actor)
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
        return self._notice(request, actor)

    def handle(self, action, deadline):
        if not numeric(action.get('interaction_id')) or not numeric(action.get('actor_id')):
            return {'error_code': 'invalid_request', 'content': MESSAGES['invalid_request']}
        try:
            manager, people = self._verify(action, deadline)
        except (AccountError, DiscordError, KeyError, TypeError) as error:
            code = str(error) if isinstance(error, AccountError) else 'discord_unavailable'
            return {'error_code': code, 'content': MESSAGES.get(code, MESSAGES['invalid_request'])}
        with self.transaction() as db:
            db.execute("SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'))")
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
                    result = self._perform(db, action, manager, people)
                    if time.monotonic() >= deadline:
                        raise AccountError('expired_action')
                    expired = db.execute('SELECT expires_at<=clock_timestamp() AS expired FROM solitary_athlete.mukmuk_account_link_actions WHERE interaction_id=%s', (action['interaction_id'],)).fetchone()['expired']
                    if expired:
                        raise AccountError('expired_action')
            except AccountError as error:
                code = str(error)
                result = {'error_code': code, 'content': MESSAGES.get(code, MESSAGES['invalid_request'])}
            db.execute("UPDATE solitary_athlete.mukmuk_account_link_actions SET status='done',result=%s,request_id=%s WHERE interaction_id=%s",
                       (Jsonb(result), result.get('request_id'), action['interaction_id']))
            return result
