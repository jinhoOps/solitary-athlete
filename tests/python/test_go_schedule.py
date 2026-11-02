from scripts.install_macos_scheduler import calendar_interval

def test_go_mode_keeps_board_fallback_each_minute_and_legacy_schedule_every_five():
    assert [entry['Minute'] for entry in calendar_interval(True)] == list(range(60))
    assert [entry['Minute'] for entry in calendar_interval(False)] == list(range(0,60,5))
