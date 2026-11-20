"""Builds the Smallfold logo files. Usage: build_logo.py <font.woff2> <out_dir> [opsz]"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from textpath import text_path

FONT, OUT = sys.argv[1], sys.argv[2]
OPSZ = float(sys.argv[3]) if len(sys.argv) > 3 else 36
INK, CREAM, BLUE, BLUE_ON_INK = '#0E0E0E', '#F1EFEB', '#2B44D6', '#A8B4FF'

# The symbol on a 24 x 24 grid: a square sheet, top right corner folded over.
SHEET = 'M13.5 3.75H3.75V20.25H20.25V10.5'
FOLD = 'M13.5 3V10.5H21Z'

def symbol(cur, acc, title=True):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-label="Smallfold">'
            f'<path d="{SHEET}" fill="none" stroke="{cur}" stroke-width="1.5"/>'
            f'<path d="{FOLD}" fill="{acc}"/></svg>\n')

def favicon():
    # Drawn on a 16 grid so every edge lands on a whole pixel at 16 px.
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'
            f'<rect width="16" height="16" rx="3" fill="{INK}"/>'
            f'<path d="M9 3.5H3.5V12.5H12.5V7" fill="none" stroke="{CREAM}"/>'
            f'<path d="M9 3V7H13Z" fill="{BLUE_ON_INK}"/></svg>\n')

def touch_icon_svg(size=180):
    # Full-bleed ink square (the phone rounds the corners itself); symbol at about half the width.
    s = size * 0.52 / 18.0            # the sheet is 18 units wide (3 to 21)
    off = (size - 24 * s) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'<rect width="{size}" height="{size}" fill="{INK}"/>'
            f'<g transform="translate({off:.3f} {off:.3f}) scale({s:.4f})">'
            f'<path d="{SHEET}" fill="none" stroke="{CREAM}" stroke-width="1.5"/>'
            f'<path d="{FOLD}" fill="{BLUE_ON_INK}"/></g></svg>\n')

def path_bounds(d):
    """Bounds of an SVG path made by text_path (absolute M, L, Q, C, Z commands only)."""
    from fontTools.svgLib.path import parse_path
    from fontTools.pens.boundsPen import BoundsPen
    bp = BoundsPen(None); parse_path(d, bp)
    return bp.bounds

def lockup(cur, acc):
    # Wordmark set at 48 units; the sheet is as tall as the capitals and stands on the baseline.
    size, pad = 48.0, 4.0
    d0, adv, m = text_path(FONT, 'Smallfold', size, wght=400, opsz=OPSZ)
    cap = m['cap']
    k = cap / 18.0                    # scale of the 24 grid so the 18-unit sheet equals cap height
    gap = cap * 0.46
    x0, y0, x1, y1 = path_bounds(d0)  # y is negative above the baseline
    top = min(y0, -cap)
    base = pad - top                  # baseline y
    text_x = pad + cap + gap - x0
    d, adv, m = text_path(FONT, 'Smallfold', size, x=text_x, y=base, wght=400, opsz=OPSZ)
    sym_x = pad - 3 * k               # the sheet's outer left edge sits on the padding
    sym_y = base - 21 * k
    W = round(pad + cap + gap + (x1 - x0) + pad, 2)
    H = round(base + max(y1, 0) + pad, 2)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W * 4:g}" height="{H * 4:g}" viewBox="0 0 {W:g} {H:g}" role="img" aria-label="Smallfold">'
            f'<g transform="translate({sym_x:.3f} {sym_y:.3f}) scale({k:.5f})">'
            f'<path d="{SHEET}" fill="none" stroke="{cur}" stroke-width="1.5"/>'
            f'<path d="{FOLD}" fill="{acc}"/></g>'
            f'<path d="{d}" fill="{cur}"/></svg>\n')

os.makedirs(OUT, exist_ok=True)
files = {
    'symbol.svg': symbol(INK, BLUE),
    'symbol-on-ink.svg': symbol(CREAM, BLUE_ON_INK),
    'favicon.svg': favicon(),
    'logo.svg': lockup(INK, BLUE),
    'logo-on-ink.svg': lockup(CREAM, BLUE_ON_INK),
    '_touch.svg': touch_icon_svg(),
}
for name, data in files.items():
    with open(os.path.join(OUT, name), 'w') as fh:
        fh.write(data)
    print(name, len(data))
