from datetime import date, datetime, timedelta, timezone
import io
import os
from PIL import Image, ImageDraw, ImageFont

KST = timezone(timedelta(hours=9))

COLOR_BG = (43, 45, 49, 255)       # Discord #2B2D31
COLOR_EMPTY = (49, 55, 61, 255)     # #31373D (Twemoji empty block)
COLOR_DISABLED = (30, 32, 35, 255)  # #1E2023 (Dark inactive future block)
COLOR_TODAY_BORDER = (87, 242, 135, 255) # #57F287 (Discord green highlight)
COLOR_TEXT = (219, 222, 225, 255)   # #DBDEE1
COLOR_MUTED = (148, 155, 164, 255)  # #949BA4

LEVELS = [
    (49, 55, 61, 255),    # 0%: empty
    (36, 75, 46, 255),    # 25%
    (48, 105, 62, 255),   # 50%
    (62, 140, 80, 255),   # 75%
    (78, 174, 99, 255),   # 100%
]

def get_font(size: int):
    candidates = [
        '/System/Library/Fonts/AppleSDGothicNeo.ttc',
        '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
        '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
        '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

class Canvas:
    """Compatibility stub for tests importing Canvas."""
    def __init__(self, width, height, bg_color):
        self.width = width
        self.height = height
        self.pixels = bytearray(width * height * 4)

def compute_grid_range(today: date):
    if today.month == 12:
        next_month_first = date(today.year + 1, 1, 1)
    else:
        next_month_first = date(today.year, today.month + 1, 1)
    current_month_end = next_month_first - timedelta(days=1)
    # End on Saturday on or after month end (Saturday is weekday 5)
    grid_end = current_month_end + timedelta(days=(5 - current_month_end.weekday()) % 7)

    # Start month: total 6 months (current month minus 5 months)
    if today.month > 5:
        start_year = today.year
        start_month = today.month - 5
    else:
        start_year = today.year - 1
        start_month = today.month + 7
    start_date = date(start_year, start_month, 1)
    # Start on Sunday on or before start_date (Sunday is weekday 6)
    grid_start = start_date - timedelta(days=(start_date.weekday() + 1) % 7)

    total_days = (grid_end - grid_start).days + 1
    total_weeks = total_days // 7
    return grid_start, grid_end, total_weeks

def render_grass_image(rows, now, member_count=None) -> bytes:
    today = now.astimezone(KST).date()
    grid_start, grid_end, num_weeks = compute_grid_range(today)

    daily_users = {}
    all_users = set()
    for row in rows:
        uid = str(row['user_id'])
        d = str(row['log_date'])
        all_users.add(uid)
        daily_users.setdefault(d, set()).add(uid)

    denom = member_count if (member_count is not None and member_count > 0) else max(len(all_users), 1)

    cell_size = 28
    cell_gap = 6
    pad_left = 60
    pad_top = 48
    pad_right = 36
    pad_bottom = 54

    width = pad_left + num_weeks * (cell_size + cell_gap) + pad_right
    height = pad_top + 7 * (cell_size + cell_gap) + pad_bottom

    img = Image.new('RGBA', (width, height), COLOR_BG)
    draw = ImageDraw.Draw(img)

    font_label = get_font(15)
    font_sm = get_font(13)

    # Weekday labels (월, 수, 금)
    weekdays = ['일', '월', '화', '수', '목', '금', '토']
    for r_idx, w_name in enumerate(weekdays):
        if r_idx in [1, 3, 5]: # 월, 수, 금
            y = pad_top + r_idx * (cell_size + cell_gap) + 6
            draw.text((pad_left - 30, y), w_name, fill=COLOR_MUTED, font=font_sm)

    # Month labels along columns
    months_seen = set()
    for col in range(num_weeks):
        col_x = pad_left + col * (cell_size + cell_gap)
        week_start = grid_start + timedelta(days=col * 7)
        for d_off in range(7):
            d = week_start + timedelta(days=d_off)
            if d.day <= 7 and d.month not in months_seen and d <= grid_end:
                months_seen.add(d.month)
                draw.text((col_x, pad_top - 26), f'{d.month}월', fill=COLOR_TEXT, font=font_label)
                break

    # Cells
    for col in range(num_weeks):
        col_x = pad_left + col * (cell_size + cell_gap)
        week_start = grid_start + timedelta(days=col * 7)
        for row in range(7):
            c_date = week_start + timedelta(days=row)
            cell_y = pad_top + row * (cell_size + cell_gap)
            iso_d = c_date.isoformat()

            if c_date > today:
                color = COLOR_DISABLED
            else:
                count = len(daily_users.get(iso_d, set()))
                if count == 0:
                    color = COLOR_EMPTY
                else:
                    opacity = min(count, 50) / min(denom, 50)
                    level = 1 if opacity <= 0.25 else 2 if opacity <= 0.50 else 3 if opacity <= 0.75 else 4
                    color = LEVELS[level]

            draw.rounded_rectangle([col_x, cell_y, col_x + cell_size, cell_y + cell_size], radius=4, fill=color)
            if c_date == today:
                draw.rounded_rectangle([col_x - 1, cell_y - 1, col_x + cell_size + 1, cell_y + cell_size + 1], radius=5, outline=COLOR_TODAY_BORDER, width=2)

    # Legend at bottom right
    leg_x = width - pad_right - 220
    leg_y = height - 34
    draw.text((leg_x - 34, leg_y + 2), '0%', fill=COLOR_MUTED, font=font_sm)
    for i, lvl_col in enumerate(LEVELS):
        bx = leg_x + i * 20
        draw.rounded_rectangle([bx, leg_y, bx + 16, leg_y + 16], radius=3, fill=lvl_col)
    draw.text((leg_x + 5 * 20 + 8, leg_y + 2), '100%', fill=COLOR_MUTED, font=font_sm)

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()
