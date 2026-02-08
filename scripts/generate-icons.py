#!/usr/bin/env python3
"""Generate app icon, adaptive icon, splash icon, and favicon for Mobility Journey."""

from PIL import Image, ImageDraw
import math
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
ASSETS_DIR = os.path.join(PROJECT_DIR, "assets", "images")

DARK_BG = (15, 23, 42)       # #0f172a
TEAL = (20, 184, 166)         # #14b8a6
TEAL_LIGHT = (94, 234, 212)   # #5eead4


def draw_spine_icon(draw, cx, cy, scale, color_main, color_accent):
    """Draw stylized spine vertebrae along an S-curve with motion arcs."""
    vertebrae_count = 7
    vertebra_width_base = int(60 * scale)
    vertebra_height = int(22 * scale)
    gap = int(8 * scale)
    total_height = vertebrae_count * (vertebra_height + gap) - gap
    start_y = cy - total_height // 2

    for i in range(vertebrae_count):
        t = i / (vertebrae_count - 1)
        x_offset = int(math.sin(t * math.pi * 1.2 - 0.3) * 40 * scale)
        dist_from_center = abs(i - vertebrae_count // 2)
        width_factor = 1.0 - (dist_from_center * 0.08)
        w = int(vertebra_width_base * width_factor)
        y = start_y + i * (vertebra_height + gap)
        x = cx + x_offset - w // 2
        r = int(color_accent[0] + (color_main[0] - color_accent[0]) * t)
        g = int(color_accent[1] + (color_main[1] - color_accent[1]) * t)
        b = int(color_accent[2] + (color_main[2] - color_accent[2]) * t)
        draw.rounded_rectangle([x, y, x + w, y + vertebra_height], radius=int(vertebra_height * 0.4), fill=(r, g, b))

    # Motion arcs
    for side, start_angle, end_angle in [(-1, 140, 220), (1, -40, 40)]:
        arc_cx = cx + side * int(100 * scale)
        color = color_accent if side == -1 else color_main
        for arc_size in [140, 110, 80]:
            s = int(arc_size * scale)
            draw.arc([arc_cx - s, cy - s, arc_cx + s, cy + s], start=start_angle, end=end_angle, fill=color, width=int(4 * scale))


def draw_circle_bg(draw, size, bg_color):
    cx, cy = size // 2, size // 2
    radius = int(size * 0.38)
    r, g, b = bg_color
    ring_color = (min(255, r + 20), min(255, g + 25), min(255, b + 35))
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=ring_color, width=int(size * 0.015))


def make_icon(size, content_scale, with_bg_ring=True):
    img = Image.new('RGBA', (size, size), DARK_BG + (255,))
    draw = ImageDraw.Draw(img)
    if with_bg_ring:
        draw_circle_bg(draw, size, DARK_BG)
    draw_spine_icon(draw, size // 2, size // 2, (size / 1024) * content_scale, TEAL, TEAL_LIGHT)
    rgb = Image.new('RGB', (size, size), DARK_BG)
    rgb.paste(img, mask=img.split()[3])
    return rgb


if __name__ == '__main__':
    os.makedirs(ASSETS_DIR, exist_ok=True)
    for name, scale, ring in [("icon.png", 1.0, True), ("adaptive-icon.png", 0.66, False), ("splash-icon.png", 0.8, False)]:
        print(f"Generating {name}...")
        make_icon(1024, scale, ring).save(os.path.join(ASSETS_DIR, name), "PNG")
    print("Generating favicon.png...")
    make_icon(512, 1.0, True).resize((48, 48), Image.LANCZOS).save(os.path.join(ASSETS_DIR, "favicon.png"), "PNG")
    print("Done!")
