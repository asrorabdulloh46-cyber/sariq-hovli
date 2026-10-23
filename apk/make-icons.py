#!/usr/bin/env python3
"""Sariq Hovli ikonkasini yaratadi va Android res papkasiga joylaydi.
Ishlatish: python3 make-icons.py <android/app/src/main/res>"""
import os, sys
from PIL import Image, ImageDraw

def art(size, pad=0.0):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # osmon
    for y in range(S):
        t = y / (S * 0.72)
        t = min(1, t)
        c = (int(95 + (234 - 95) * t), int(166 + (216 - 166) * t), int(230 + (168 - 230) * t), 255)
        d.line([(0, y), (S, y)], fill=c)
    d.rectangle([0, int(S * 0.72), S, S], fill=(214, 178, 94, 255))
    def R(x0, y0, x1, y1, fill, outline=None, w=0):
        d.rectangle([int(S * x0), int(S * y0), int(S * x1), int(S * y1)], fill=fill, outline=outline, width=int(S * w))
    # binolar
    for bx in (0.08, 0.59):
        R(bx, 0.30, bx + 0.33, 0.78, (200, 154, 74, 255), (122, 90, 28, 255), 0.012)
        for r in range(3):
            for c in range(3):
                if r == 2 and c == 1: continue
                x = bx + 0.045 + c * 0.09; y = 0.36 + r * 0.12
                R(x, y, x + 0.06, y + 0.07, (58, 42, 20, 255))
    # yashik
    R(0.44, 0.72, 0.56, 0.86, (156, 108, 54, 255), (106, 69, 32, 255), 0.012)
    # nishon
    cx, cy, r = 0.5, 0.51, 0.085
    col = (229, 57, 53, 255)
    d.ellipse([int(S * (cx - r)), int(S * (cy - r)), int(S * (cx + r)), int(S * (cy + r))], outline=col, width=int(S * 0.016))
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        d.line([(int(S * (cx + dx * r * 0.6)), int(S * (cy + dy * r * 0.6))), (int(S * (cx + dx * r * 1.7)), int(S * (cy + dy * r * 1.7)))], fill=col, width=int(S * 0.016))
    d.ellipse([int(S * (cx - 0.008)), int(S * (cy - 0.008)), int(S * (cx + 0.008)), int(S * (cy + 0.008))], fill=col)
    return im.resize((size, size), Image.LANCZOS)

def rounded(im, radius_frac):
    size = im.size[0]
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=int(size * 4 * radius_frac), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0)); out.paste(im, (0, 0), mask); return out

def circle(im):
    size = im.size[0]
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0)); out.paste(im, (0, 0), mask); return out

def main(res):
    legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    fg = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    for dens, px in legacy.items():
        d = os.path.join(res, f'mipmap-{dens}'); os.makedirs(d, exist_ok=True)
        a = art(px)
        rounded(a, 0.18).save(os.path.join(d, 'ic_launcher.png'))
        circle(a).save(os.path.join(d, 'ic_launcher_round.png'))
        # adaptive foreground: rasm xavfsiz hududda (66%)
        F = fg[dens]
        canvas = Image.new('RGBA', (F, F), (0, 0, 0, 0))
        inner = int(F * 0.66)
        canvas.paste(art(inner), ((F - inner) // 2, (F - inner) // 2))
        canvas.save(os.path.join(d, 'ic_launcher_foreground.png'))
    # adaptive fon rangi
    vals = os.path.join(res, 'values'); os.makedirs(vals, exist_ok=True)
    open(os.path.join(vals, 'ic_launcher_background.xml'), 'w').write(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#D6B25E</color>\n</resources>\n')
    art(512).save(os.path.join(os.path.dirname(res), '..', '..', '..', '..', 'icon-512.png')) if False else None

if __name__ == '__main__':
    main(sys.argv[1])
