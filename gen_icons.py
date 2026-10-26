# -*- coding: utf-8 -*-
"""
Генератор PNG-иконок приложения (512 и 192 px).
Работает без сторонних библиотек: рисуем пиксели вручную и
кодируем PNG средствами стандартного zlib.

Запуск:  py gen_icons.py
"""
import zlib, struct

# ---------- 1. Геометрия фигур ----------

def rounded_rect_dist(x, y, cx, cy, hw, hh, r):
    """Расстояние точки (x, y) до скруглённого прямоугольника
    с центром (cx, cy), полушириной hw, полувысотой hh, радиусом r.
    Внутри — отрицательное. По нему рисуем фигуры сглаженно."""
    dx = abs(x - cx) - (hw - r)
    dy = abs(y - cy) - (hh - r)
    dx = max(dx, 0.0)
    dy = max(dy, 0.0)
    return (dx * dx + dy * dy) ** 0.5 + min(max(dx, dy), 0.0) - r

def make_scene(S):
    """Возвращает список (фигура, цвет) в координатах 0..S.
    Фигуры повторяют icons/icon.svg."""
    k = S / 512.0  # масштаб из координат макета 512x512
    return [
        # фон — скруглённый квадрат
        (lambda x, y: rounded_rect_dist(x, y, S/2, S/2, S/2, S/2, 110*k), (0x0f, 0x17, 0x2a)),
        # маленькие внешние блины
        (lambda x, y: rounded_rect_dist(x, y,  75*k, S/2, 15*k, 44*k, 10*k), (0x94, 0xa3, 0xb8)),
        (lambda x, y: rounded_rect_dist(x, y, 437*k, S/2, 15*k, 44*k, 10*k), (0x94, 0xa3, 0xb8)),
        # большие зелёные блины
        (lambda x, y: rounded_rect_dist(x, y, 120*k, S/2, 24*k, 76*k, 14*k), (0x22, 0xc5, 0x5e)),
        (lambda x, y: rounded_rect_dist(x, y, 392*k, S/2, 24*k, 76*k, 14*k), (0x22, 0xc5, 0x5e)),
        # гриф
        (lambda x, y: rounded_rect_dist(x, y, S/2, S/2, 120*k, 12*k, 12*k), (0xe2, 0xe8, 0xf0)),
    ]

# ---------- 2. Рендер с простым сглаживанием (суперсэмплинг 3x3) ----------

def render(S):
    scene = make_scene(S)
    step = 1.0 / 3.0
    rows = []
    for py in range(S):
        row = bytearray([0])  # PNG: строка начинается с байта-фильтра 0
        for px in range(S):
            r = g = b = 0
            a_sum = 0
            n = 0
            for sy in (-1, 0, 1):
                for sx in (-1, 0, 1):
                    x = px + 0.5 + sx * step
                    y = py + 0.5 + sy * step
                    cr = cg = cb = 0
                    alpha = 0
                    for dist_fn, color in scene:
                        if dist_fn(x, y) < 0:  # точка внутри фигуры
                            cr, cg, cb = color
                            alpha = 255
                    r += cr; g += cg; b += cb; a_sum += alpha; n += 1
            row += bytes((r // n, g // n, b // n, a_sum // n))
        rows.append(bytes(row))
    return rows

# ---------- 3. Кодирование PNG (стандартный zlib) ----------

def write_png(path, size, rows, height=None):
    # RGBA (цветовой тип 6): у иконок прозрачные углы
    height = height or size
    def chunk(tag, data):
        raw = tag + data
        return struct.pack('>I', len(data)) + raw + struct.pack('>I', zlib.crc32(raw))
    ihdr = struct.pack('>IIBBBBB', size, height, 8, 6, 0, 0, 0)  # 8 бит, RGBA
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(b''.join(rows), 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)

if __name__ == '__main__':
    import os
    os.makedirs('icons', exist_ok=True)
    for size in (512, 192):
        write_png(f'icons/icon-{size}.png', size, render(size))
        print(f'icons/icon-{size}.png готово')
