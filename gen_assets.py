# -*- coding: utf-8 -*-
"""
Генератор ассетов для Android-сборки (Capacitor Assets):
  assets/icon.png   — иконка 1024x1024
  assets/splash.png — splash-экран 2732x2732 (фон + логотип по центру)

Запускается после gen_icons.py (использует его render/write_png).
Запуск:  py gen_assets.py
"""
import os
from gen_icons import render, write_png

BG = (0x0f, 0x17, 0x2a)  # --bg из style.css


def make_splash(size, logo_size):
    """Тёмный фон + логотип по центру. Возвращает строки RGBA для write_png."""
    logo = render(logo_size)            # квадратные строки логотипа
    off = (size - logo_size) // 2
    bg_row = bytes([0]) + bytes(BG + (255,)) * size
    rows = []
    for y in range(size):
        row = bytearray(bg_row)
        if off <= y < off + logo_size:
            lrow = logo[y - off]
            for x in range(logo_size):
                lr = lrow[1 + x * 4: 5 + x * 4]  # RGBA пикселя логотипа
                a = lr[3] / 255
                if a:
                    base = 1 + (off + x) * 4
                    for i in range(3):
                        row[base + i] = int(lr[i] * a + row[base + i] * (1 - a))
                    row[base + 3] = 255
        rows.append(bytes(row))
    return rows


if __name__ == '__main__':
    os.makedirs('assets', exist_ok=True)
    write_png('assets/icon.png', 1024, render(1024))
    print('assets/icon.png готово')
    S, LOGO = 2732, 700
    write_png('assets/splash.png', S, make_splash(S, LOGO), height=S)
    print('assets/splash.png готово')
