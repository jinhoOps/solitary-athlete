from datetime import datetime, timezone
from mukmuk.board import build_board

def test_14_day_board_weekday_headers_and_two_rows():
    # 2026-10-14 is Wednesday (weekday 2)
    # Last week: 2026-10-05 (Mon) to 2026-10-11 (Sun)
    # This week: 2026-10-12 (Mon) to 2026-10-18 (Sun), today is 10-14 (Wed)
    now = datetime(2026, 10, 14, 11, 28, tzinfo=timezone.utc) # 20:28 KST
    rows = [
        {'user_id': '123', 'username': 'jhoops', 'log_date': '2026-10-14', 'memo': '달리기', 'has_photo': True},
        {'user_id': '123', 'username': 'jhoops', 'log_date': '2026-10-07', 'memo': '웨이트', 'has_photo': False}, # last week Wednesday
    ]
    emojis = ('111', '222')
    pages = build_board(rows, now, 'https://jinhoops.github.io/solitary-athlete/', emojis=emojis, secret_code='mukmuk-fixture')
    assert len(pages) == 1
    content = pages[0]

    assert content.startswith('## 🌱 고운 잔디밭\n최근 14일 · 갱신 · 10.14 20:28 KST')
    assert 'jhoops · 이번 주 1일 · 누적 2일' in content
    assert '월 | 화 | 수 | 목 | 금 | 토 | 일' in content

    # Check 2 rows of 7 cells
    # Last week (10-05 Mon .. 10-11 Sun): 10-07 Wed had text log <:mukmuk_grass:111>
    # Mon: ⬜, Tue: ⬜, Wed: <:mukmuk_grass:111>, Thu: ⬜, Fri: ⬜, Sat: ⬜, Sun: ⬜
    expected_row1 = '⬜⬜<:mukmuk_grass:111>⬜⬜⬜⬜'
    # This week (10-12 Mon .. 10-18 Sun): 10-14 Wed had photo <:mukmuk_photo:222>
    # Mon: ⬜, Tue: ⬜, Wed: <:mukmuk_photo:222>, Thu..Sun: ⬜ (future/empty)
    expected_row2 = '⬜⬜<:mukmuk_photo:222>⬜⬜⬜⬜'

    assert expected_row1 in content
    assert expected_row2 in content

    assert '[웹보드 바로 가기](https://jinhoops.github.io/solitary-athlete/?code=mukmuk-fixture)' in content
    assert '> ⬜ 기록 없음 · <:mukmuk_grass:111> 텍스트 · <:mukmuk_photo:222> 사진 포함' in content

def test_empty_board_message():
    now = datetime(2026, 10, 14, 11, 28, tzinfo=timezone.utc)
    pages = build_board([], now, 'https://jinhoops.github.io/solitary-athlete/')
    assert '첫 잔디를 기다리고 있어요.' in pages[0]

def test_board_link_contains_current_secret_and_preserves_query():
    now = datetime(2026,10,14,tzinfo=timezone.utc)
    content = build_board([],now,'https://example.com/board/?from=discord#grass',secret_code='mukmuk-fixture')[0]
    assert 'https://example.com/board/?from=discord&code=mukmuk-fixture#grass' in content
    assert '웹보드 바로 가기' in content


def test_board_stops_before_writes_when_lock_is_lost_during_history_read():
    import pytest
    from mukmuk.board import update_board
    alive = [True]
    class API:
        def messages(self, channel, before=None):
            alive[0] = False
            return []
        def write(self, *args):
            pytest.fail('must not publish after losing the sync lock')
    class Store:
        def board_ids(self, *args):
            pytest.fail('must not change state after losing the sync lock')
    def check():
        if not alive[0]: raise RuntimeError('lock connection lost')
    with pytest.raises(RuntimeError, match='lock connection lost'):
        update_board(API(), Store(), {'DISCORD_BOARD_CHANNEL_ID':'board','DISCORD_AUTH_CHANNEL_ID':'auth'}, ['page'], 'bot', check_lock=check)
