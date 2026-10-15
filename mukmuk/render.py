from datetime import date, timedelta, timezone
import struct
import zlib

KST = timezone(timedelta(hours=9))

FONT_5X7 = {
    ' ': [0, 0, 0, 0, 0],
    '0': [0x3e, 0x51, 0x49, 0x45, 0x3e],
    '1': [0x00, 0x42, 0x7f, 0x40, 0x00],
    '2': [0x42, 0x61, 0x51, 0x49, 0x46],
    '3': [0x21, 0x41, 0x45, 0x4b, 0x31],
    '4': [0x18, 0x14, 0x12, 0x7f, 0x10],
    '5': [0x27, 0x45, 0x45, 0x45, 0x39],
    '6': [0x3c, 0x4a, 0x49, 0x49, 0x30],
    '7': [0x01, 0x71, 0x09, 0x05, 0x03],
    '8': [0x36, 0x49, 0x49, 0x49, 0x36],
    '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
    '%': [0x23, 0x13, 0x08, 0x64, 0x62],
    '.': [0x00, 0x60, 0x60, 0x00, 0x00],
    ':': [0x00, 0x36, 0x36, 0x00, 0x00],
    '·': [0x00, 0x0c, 0x0c, 0x00, 0x00],
    '-': [0x08, 0x08, 0x08, 0x08, 0x08],
    '~': [0x08, 0x04, 0x08, 0x10, 0x08],
    '/': [0x20, 0x10, 0x08, 0x04, 0x02],
    '(': [0x00, 0x1c, 0x22, 0x41, 0x00],
    ')': [0x00, 0x41, 0x22, 0x1c, 0x00],
    'K': [0x7f, 0x08, 0x14, 0x22, 0x41],
    'S': [0x46, 0x49, 0x49, 0x49, 0x31],
    'T': [0x01, 0x01, 0x7f, 0x01, 0x01],
}

# 7x8 custom Korean glyphs
KOREAN_GLYPHS = {
    '월': [0b0111000, 0b1000101, 0b0111011, 0b0010001, 0b1111111, 0b1111000, 0b0001000, 0b1111000],
    '화': [0b0100100, 0b1111110, 0b0100100, 0b1000010, 0b1111110, 0b0010010, 0b0100010, 0b1000010],
    '수': [0b0010000, 0b0101000, 0b1000100, 0b0000000, 0b1111110, 0b0010000, 0b0010000, 0b0010000],
    '목': [0b0010000, 0b1111110, 0b0010000, 0b0101000, 0b1000100, 0b1111110, 0b1000100, 0b1111110],
    '금': [0b0010000, 0b0101000, 0b1000100, 0b1111110, 0b1000100, 0b1111110, 0b0000000, 0b1111110],
    '토': [0b0010000, 0b1111110, 0b0010000, 0b0010000, 0b1111110, 0b0000000, 0b0000000, 0b0000000],
    '일': [0b0111000, 0b1000100, 0b0111000, 0b0000000, 0b1111110, 0b0000010, 0b1111110, 0b1000000, 0b1111110],
}

COLOR_BG = (43, 45, 49, 255)       # Discord #2B2D31
COLOR_EMPTY = (49, 55, 61, 255)     # #31373D (Twemoji empty block)
COLOR_DISABLED = (32, 34, 37, 255)  # #202225 (Dark inactive block)
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

def encode_png(width, height, pixels):
    raw = bytearray()
    row_bytes = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y * row_bytes : (y + 1) * row_bytes])
    compressed = zlib.compress(raw, level=6)
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")

class Canvas:
    def __init__(self, width, height, bg_color):
        self.width = width
        self.height = height
        self.pixels = bytearray(width * height * 4)
        for i in range(width * height):
            idx = i * 4
            self.pixels[idx] = bg_color[0]
            self.pixels[idx+1] = bg_color[1]
            self.pixels[idx+2] = bg_color[2]
            self.pixels[idx+3] = bg_color[3]

    def set_pixel(self, x, y, color):
        if 0 <= x < self.width and 0 <= y < self.height:
            idx = (y * self.width + x) * 4
            self.pixels[idx] = color[0]
            self.pixels[idx+1] = color[1]
            self.pixels[idx+2] = color[2]
            self.pixels[idx+3] = color[3]

    def draw_rect(self, x, y, w, h, color, rx=0):
        for cy in range(y, y + h):
            for cx in range(x, x + w):
                if rx > 0:
                    if (cx == x and cy == y) or (cx == x + w - 1 and cy == y) or \
                       (cx == x and cy == y + h - 1) or (cx == x + w - 1 and cy == y + h - 1):
                        continue
                self.set_pixel(cx, cy, color)

    def draw_rect_border(self, x, y, w, h, color):
        for cx in range(x, x + w):
            self.set_pixel(cx, y, color)
            self.set_pixel(cx, y + h - 1, color)
        for cy in range(y, y + h):
            self.set_pixel(x, cy, color)
            self.set_pixel(x + w - 1, cy, color)

    def draw_char(self, x, y, ch, color):
        if ch in KOREAN_GLYPHS:
            rows = KOREAN_GLYPHS[ch]
            for row_idx, row_val in enumerate(rows):
                for col_idx in range(7):
                    if (row_val >> (6 - col_idx)) & 1:
                        self.set_pixel(x + col_idx, y + row_idx, color)
            return 8
        if ch in FONT_5X7:
            cols = FONT_5X7[ch]
            for col_idx, col_val in enumerate(cols):
                for row_idx in range(7):
                    if (col_val >> row_idx) & 1:
                        self.set_pixel(x + col_idx, y + row_idx, color)
            return 6
        return 4

    def draw_text(self, x, y, text, color):
        cur_x = x
        for ch in text:
            cur_x += self.draw_char(cur_x, y, ch, color)
        return cur_x

def compute_grid_range(today):
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

def render_grass_image(rows, now, member_count=None):
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

    cell_size = 15
    cell_gap = 4
    pad_left = 30
    pad_top = 28
    pad_right = 16
    pad_bottom = 26

    width = pad_left + num_weeks * (cell_size + cell_gap) + pad_right
    height = pad_top + 7 * (cell_size + cell_gap) + pad_bottom

    canvas = Canvas(width, height, COLOR_BG)

    # Weekday labels on the left (일, 화, 목, 토)
    weekday_labels = {0: '일', 2: '화', 4: '목', 6: '토'}
    for r_idx, label in weekday_labels.items():
        y = pad_top + r_idx * (cell_size + cell_gap) + 3
        canvas.draw_char(pad_left - 16, y, label, COLOR_MUTED)

    # Month labels along columns
    months_seen = set()
    for col in range(num_weeks):
        col_x = pad_left + col * (cell_size + cell_gap)
        col_date = grid_start + timedelta(days=col * 7)
        for d_offset in range(7):
            d = col_date + timedelta(days=d_offset)
            if d.day <= 7 and d.month not in months_seen and d <= grid_end:
                months_seen.add(d.month)
                canvas.draw_text(col_x, pad_top - 14, f'{d.month}월', COLOR_TEXT)
                break

        # Render cells in this week column
        for row in range(7):
            c_date = col_date + timedelta(days=row)
            cell_y = pad_top + row * (cell_size + cell_gap)
            iso_d = c_date.isoformat()

            if c_date > today:
                # Disabled block for future dates
                color = COLOR_DISABLED
            else:
                count = len(daily_users.get(iso_d, set()))
                if count == 0:
                    color = COLOR_EMPTY
                else:
                    opacity = min(count, 50) / min(denom, 50)
                    level = 1 if opacity <= 0.25 else 2 if opacity <= 0.50 else 3 if opacity <= 0.75 else 4
                    color = LEVELS[level]

            canvas.draw_rect(col_x, cell_y, cell_size, cell_size, color, rx=2)
            if c_date == today:
                canvas.draw_rect_border(col_x - 1, cell_y - 1, cell_size + 2, cell_size + 2, COLOR_TODAY_BORDER)

    # Legend at bottom right
    leg_x = width - 150
    leg_y = height - 16
    canvas.draw_text(leg_x - 22, leg_y + 2, '0%', COLOR_MUTED)
    for i, lvl_col in enumerate(LEVELS):
        canvas.draw_rect(leg_x + i * 14, leg_y, 10, 10, lvl_col, rx=2)
    canvas.draw_text(leg_x + 5 * 14 + 4, leg_y + 2, '100%', COLOR_MUTED)

    return encode_png(width, height, canvas.pixels)
