#!/usr/bin/env python3
"""
VetCore a11y kontrast düzeltmesi (axe color-contrast ihlalleri).
Sadece FG rengi koyulaştır (hue korunur), hedef oran 4.55 (WCAG AA 4.5 + pay).
"""
import colorsys


def hex2rgb(h: str):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb2hex(rgb) -> str:
    return '#{:02X}{:02X}{:02X}'.format(*[round(c) for c in rgb])


def rel_lum(rgb):
    def lin(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg):
    l1, l2 = sorted((rel_lum(fg), rel_lum(bg)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def darken_until(hex_color, bgs, target=4.55):
    """hex'i koyulaştır; tüm bg'lerle orana ulaşan EN AÇIK (max k) değeri bul."""
    rgb0 = hex2rgb(hex_color)
    lo, hi = 0.50, 1.0
    best = None
    for _ in range(60):
        k = (lo + hi) / 2
        rgb = tuple(c * k for c in rgb0)
        if all(contrast(rgb, hex2rgb(b)) >= target for b in bgs):
            best = rgb  # geçti → daha açığı da geçebilir mi diye yukarı bak
            lo = k
        else:
            hi = k  # geçemedi → koyulaştır
    return rgb2hex(best), contrast(best, hex2rgb(bgs[0]))


PAIRS = [
    # (ad, mevcut FG, arkalar [WCAG eşik ihlali yapanlar])
    ("primary (beyaz metin + sayfa zemininde metin)", "#28847C", ["#FFFFFF", "#F7F9F8"]),  # Button/Badge default
    ("muted-foreground",           "#6E7C80", ["#FFFFFF", "#F0F4F3", "#F7F9F8"]),  # kart ipucu + nötr çip
    ("status-success",             "#21845A", ["#E6F4EE"]),
    ("status-warning",             "#C78A2C", ["#FAF1E0"]),
    ("status-danger",              "#C44E4E", ["#F9E8E8"]),
    ("status-info",                "#3979B8", ["#E7F0F8"]),
]

print(f"{'token':<30} {'eski':<9} {'yeni':<9} {'eski oran':>9} {'yeni oran':>9}")
for name, fg, bgs in PAIRS:
    old_ratio = contrast(hex2rgb(fg), hex2rgb(bgs[0]))
    new_hex, new_ratio = darken_until(fg, bgs)
    print(f"{name:<30} {fg:<9} {new_hex:<9} {old_ratio:>8.2f} {new_ratio:>9.2f}")
