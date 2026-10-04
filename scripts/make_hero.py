"""Generate docs/assets/hero.png (README banner). Run: python scripts/make_hero.py"""
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, S = 1600, 420, 2  # supersample for smooth edges
w, h = W * S, H * S
stops = [(0, (27, 20, 100)), (0.55, (15, 111, 168)), (1, (20, 184, 166))]

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

img = Image.new("RGB", (w, h))
px = ImageDraw.Draw(img)
for x in range(w):
    t = x / (w - 1)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t0 <= t <= t1:
            col = lerp(c0, c1, (t - t0) / (t1 - t0))
            break
    px.line([(x, 0), (x, h)], fill=col)

# network motif
rnd = random.Random(7)
ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
def net(cx_range):
    pts = [(rnd.randint(*cx_range) * S, rnd.randint(40, H - 40) * S) for _ in range(9)]
    for i, p in enumerate(pts):
        for q in pts[i + 1:i + 3]:
            d.line([p, q], fill=(255, 255, 255, 60), width=3 * S // 2)
    for i, p in enumerate(pts):
        r = (9 if i % 4 == 0 else 6) * S
        col = (255, 122, 26, 255) if i % 4 == 0 else (255, 255, 255, 140)
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=col)
net((30, 330))
net((1270, 1570))

# dark wave at bottom
import math
wave = Image.new("RGBA", (w, h), (0, 0, 0, 0))
wd = ImageDraw.Draw(wave)
poly = [(x, int((H - 55 + 14 * math.sin(x / (S * 130))) * S)) for x in range(0, w + 1, 8)]
poly += [(w, h), (0, h)]
wd.polygon(poly, fill=(5, 18, 31, 150))
img = Image.alpha_composite(Image.alpha_composite(img.convert("RGBA"), ov), wave)
d = ImageDraw.Draw(img)

def font(name, size):
    return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size * S)

def spaced(text, f, y, fill, gap):
    widths = [d.textlength(c, font=f) for c in text]
    total = sum(widths) + gap * S * (len(text) - 1)
    x = (w - total) / 2
    for c, cw in zip(text, widths):
        d.text((x, y * S), c, font=f, fill=fill)
        x += cw + gap * S
    return total

white = (255, 255, 255, 255)
spaced("AEDIS", font("segoeuib.ttf", 112), 62, white, 26)
spaced("SMART ASSISTANT", font("seguisb.ttf", 40), 200, (255, 255, 255, 235), 14)

# rule with event label
label = "FINTECHSTICO '26"
lf = font("seguisb.ttf", 22)
lw = spaced(label, lf, 276, (255, 255, 255, 255), 6)
cy = int(290 * S)
d.line([(w / 2 - lw / 2 - 360 * S, cy), (w / 2 - lw / 2 - 28 * S, cy)], fill=(255, 255, 255, 190), width=2 * S)
d.line([(w / 2 + lw / 2 + 28 * S, cy), (w / 2 + lw / 2 + 360 * S, cy)], fill=(255, 255, 255, 190), width=2 * S)

tf = font("segoeui.ttf", 28)
tag = "Risk & Fraud Intelligence Platform"
tw = d.textlength(tag, font=tf)
d.text(((w - tw) / 2, 328 * S), tag, font=tf, fill=(255, 255, 255, 230))

img = img.convert("RGB").resize((W, H), Image.LANCZOS)
img.save("docs/assets/hero.png", optimize=True)
print("saved", img.size)
