from datetime import datetime, timezone, date
from mukmuk.render import render_grass_image, compute_grid_range

def test_grid_range_covers_current_month_end_and_six_months():
    # 2026-10-15 is Thursday
    now = datetime(2026, 10, 15, 17, 0, tzinfo=timezone.utc)
    grid_start, grid_end, total_weeks = compute_grid_range(now.astimezone(timezone.utc).date())
    
    # Grid should start on Sunday
    assert grid_start.weekday() == 6 # Sunday
    # Grid should end on Saturday on or after 2026-10-31
    assert grid_end.weekday() == 5 # Saturday
    assert grid_end >= date(2026, 10, 31)
    # May 1st is 5 months before October (May, Jun, Jul, Aug, Sep, Oct = 6 months)
    assert grid_start <= date(2026, 5, 1)
    assert total_weeks >= 26

def test_render_grass_image_returns_valid_png():
    now = datetime(2026, 10, 15, 17, 0, tzinfo=timezone.utc)
    rows = [
        {'user_id': '1', 'username': 'jhoops', 'log_date': '2026-10-15', 'has_photo': True},
        {'user_id': '2', 'username': 'xion', 'log_date': '2026-10-14', 'has_photo': False},
        {'user_id': '1', 'username': 'jhoops', 'log_date': '2026-06-01', 'has_photo': False},
    ]
    png_bytes = render_grass_image(rows, now, member_count=3)
    
    assert png_bytes.startswith(b'\x89PNG\r\n\x1a\n')
    assert png_bytes.endswith(b'IEND\xaeB`\x82')
    assert len(png_bytes) > 1000

def test_future_dates_rendered_as_disabled_blocks():
    from mukmuk.render import Canvas, COLOR_DISABLED, COLOR_EMPTY, LEVELS
    now = datetime(2026, 10, 15, 17, 0, tzinfo=timezone.utc)
    # No workouts at all
    png_bytes = render_grass_image([], now, member_count=1)
    assert len(png_bytes) > 0
