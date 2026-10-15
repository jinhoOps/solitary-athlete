from datetime import timedelta, timezone
import re
from .links import dashboard_link

KST = timezone(timedelta(hours=9))
MARKER = '고운 잔디밭'
WEEKDAYS = '일 | 월 | 화 | 수 | 목 | 금 | 토'

def safe_name(value):
    return re.sub(r'[`*_~<>@\r\n]', '', value)[:48] or '운동가'

def grass_lines(dates, photos, this_sunday, today, emojis=None):
    record, photo = ('🟩', '🌲')
    if emojis and all(emojis):
        record, photo = f'<:mukmuk_grass:{emojis[0]}>', f'<:mukmuk_photo:{emojis[1]}>'
    last_sunday = this_sunday - timedelta(days=7)

    # Row 1: Last week (Sunday .. Saturday)
    row1 = []
    for i in range(7):
        d = (last_sunday + timedelta(days=i)).isoformat()
        row1.append(photo if d in photos else record if d in dates else '⬛')

    # Row 2: This week (Sunday .. Saturday)
    row2 = []
    for i in range(7):
        cur = this_sunday + timedelta(days=i)
        d = cur.isoformat()
        if cur > today:
            row2.append('⬛')
        else:
            row2.append(photo if d in photos else record if d in dates else '⬛')

    return [''.join(row1), ''.join(row2)]

def units(text): return len(text.encode('utf-16-le')) // 2

def build_board(rows, now, dashboard_url='', emojis=None, secret_code=None):
    today = now.astimezone(KST).date()
    this_sunday = today - timedelta(days=(today.weekday()+1)%7)
    sunday_iso = this_sunday.isoformat()
    members = {}
    for row in rows:
        uid = row['user_id']
        member = members.setdefault(uid, {'name': row['username'], 'dates': set(), 'photos': set()})
        d = str(row['log_date'])
        if d > today.isoformat(): continue
        member['dates'].add(d)
        if row['has_photo']: member['photos'].add(d)
    header = f'## 🌱 {MARKER}\n최근 14일 · 갱신 · {now.astimezone(KST):%m.%d %H:%M} KST'
    footer_parts = []
    link = dashboard_link(dashboard_url, secret_code)
    if link:
        footer_parts.append(f'[웹보드 바로 가기]({link})')
    elif dashboard_url:
        footer_parts.append('웹보드 접속 링크는 #공지에서 확인해 주세요.')
    legend = '> ⬛ 기록 없음 · 🟩 텍스트 · 🌲 사진 포함'
    if emojis and all(emojis):
        legend = f'> ⬛ 기록 없음 · <:mukmuk_grass:{emojis[0]}> 텍스트 · <:mukmuk_photo:{emojis[1]}> 사진 포함'
    footer_parts.append(legend)
    footer = '\n\n' + '\n'.join(footer_parts)

    pages, blocks = [], []
    for uid, m in sorted(members.items(), key=lambda p:(p[1]['name'],p[0])):
        week = sum(d >= sunday_iso for d in m['dates'])
        block = f"{safe_name(m['name'])} · 이번 주 {week}일 · 누적 {len(m['dates'])}일\n{WEEKDAYS}\n" + '\n'.join(grass_lines(m['dates'], m['photos'], this_sunday, today, emojis))
        candidate = header + '\n\n' + '\n\n'.join(blocks+[block]) + footer
        if units(candidate) > 1970 and blocks:
            pages.append(header + '\n\n' + '\n\n'.join(blocks) + footer); blocks=[]
        blocks.append(block)
    pages.append(header+'\n\n'+ ('\n\n'.join(blocks) if blocks else '첫 잔디를 기다리고 있어요.')+footer)
    if len(pages)>1: pages=[p.replace(MARKER,f'{MARKER} ({i+1}/{len(pages)})',1) for i,p in enumerate(pages)]
    if any(units(p)>2000 for p in pages): raise ValueError('Board member exceeds Discord content limit')
    return pages

def update_board(api, store, settings, pages, bot_id, check_lock=lambda: None):
    channel, auth_channel = settings['DISCORD_BOARD_CHANNEL_ID'], settings['DISCORD_AUTH_CHANNEL_ID']
    before, found = None, {}
    while True:
        check_lock()
        batch = api.messages(channel, before)
        for msg in batch:
            first_line = msg.get('content','').split('\n')[0]
            if msg.get('author',{}).get('id') == bot_id and (first_line.startswith(f'## 🌱 {MARKER}') or first_line.startswith('🌱 묵묵 · 운동 잔디 현황')):
                found[msg['id']] = msg
        if len(batch)<100: break
        before = batch[-1]['id']
    ids = sorted(found, key=int)
    kept = []
    for i, content in enumerate(pages):
        check_lock()
        result = api.write(channel, content, ids[i] if i<len(ids) else None)
        check_lock()
        kept.append(result['id'])
        store.board_ids(auth_channel, kept + ids[i+1:])
    for mid in ids[len(pages):]:
        check_lock()
        api.delete(channel, mid)
    check_lock()
    store.board_ids(auth_channel, kept)
