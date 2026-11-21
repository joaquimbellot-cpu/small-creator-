"""Builds the Smallfold logo files. Usage: build_logo.py <upright font.woff2> <out_dir> [opsz] [italic font.woff2]"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from textpath import text_path

FONT, OUT = sys.argv[1], sys.argv[2]
OPSZ = float(sys.argv[3]) if len(sys.argv) > 3 else 36
INK, CREAM, BLUE, BLUE_ON_INK = '#0E0E0E', '#F1EFEB', '#2B44D6', '#A8B4FF'

def path_bounds(d):
    """Bounds of an SVG path made by text_path (absolute M, L, Q, C, Z commands only)."""
    from fontTools.svgLib.path import parse_path
    from fontTools.pens.boundsPen import BoundsPen
    bp = BoundsPen(None); parse_path(d, bp)
    return bp.bounds

# The symbol on a 24 x 24 grid: a light italic S inside a ring, with one dot on the ring in the accent
# (the one that was chosen). ITALIC is the italic font file, given as the fourth argument.
ITALIC = sys.argv[4] if len(sys.argv) > 4 else FONT.replace('normal', 'italic')
DOT = (19.07, 4.93, 2.3)             # x, y, radius: on the ring, at the upper right

def letter_s(size, cx, cy):
    """The italic S as a path, centred on (cx, cy)."""
    d, adv, m = text_path(ITALIC, 'S', size, wght=300, opsz=OPSZ)
    x0, y0, x1, y1 = path_bounds(d)
    d, adv, m = text_path(ITALIC, 'S', size, x=cx - (x0 + x1) / 2, y=cy - (y0 + y1) / 2, wght=300, opsz=OPSZ)
    return d

def mark(cur, acc):
    """The inside of the symbol's <svg>, for the 24 grid."""
    return (f'<circle cx="12" cy="12" r="10" fill="none" stroke="{cur}" stroke-width="1.25"/>'
            f'<path d="{letter_s(17.5, 11.7, 12.1)}" fill="{cur}"/>'
            f'<circle cx="{DOT[0]}" cy="{DOT[1]}" r="{DOT[2]}" fill="{acc}"/>')

def symbol(cur, acc, title=True):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-label="Smallfold">'
            f'{mark(cur, acc)}</svg>\n')

def favicon():
    # At 16 px the ring would blur, so the tab icon is the S and the dot alone on an ink square.
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'
            f'<rect width="16" height="16" rx="3.5" fill="{INK}"/>'
            f'<path d="{letter_s(14, 7.1, 8.6)}" fill="{CREAM}"/>'
            f'<circle cx="12.7" cy="3.3" r="1.6" fill="{BLUE_ON_INK}"/></svg>\n')

def touch_icon_svg(size=180):
    # Full-bleed ink square (the phone rounds the corners itself); the symbol at about 60% of the width.
    s = size * 0.6 / 20.0             # the ring is 20 units wide
    off = (size - 24 * s) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'<rect width="{size}" height="{size}" fill="{INK}"/>'
            f'<g transform="translate({off:.3f} {off:.3f}) scale({s:.4f})">{mark(CREAM, BLUE_ON_INK)}</g></svg>\n')

def lockup(cur, acc):
    # Wordmark set at 48 units; the ring is a third taller than the capitals and centred on them.
    size, pad = 48.0, 4.0
    d0, adv, m = text_path(FONT, 'Smallfold', size, wght=400, opsz=OPSZ)
    cap = m['cap']
    dia = cap * 1.36
    k = dia / 20.0                    # scale of the 24 grid so the 20-unit ring has that diameter
    gap = cap * 0.4
    x0, y0, x1, y1 = path_bounds(d0)  # y is negative above the baseline
    top = min(y0, -cap, -(cap + dia) / 2 - 3 * k)
    base = pad - top                  # baseline y
    text_x = pad + dia + gap - x0
    d, adv, m = text_path(FONT, 'Smallfold', size, x=text_x, y=base, wght=400, opsz=OPSZ)
    sym_x = pad - 2 * k               # the ring's left edge sits on the padding
    sym_y = base - cap / 2 - 12 * k   # the ring's centre is at half the capital height
    W = round(pad + dia + gap + (x1 - x0) + pad, 2)
    H = round(max(base + max(y1, 0), sym_y + 22 * k) + pad, 2)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W * 4:g}" height="{H * 4:g}" viewBox="0 0 {W:g} {H:g}" role="img" aria-label="Smallfold">'
            f'<g transform="translate({sym_x:.3f} {sym_y:.3f}) scale({k:.5f})">{mark(cur, acc)}</g>'
            f'<path d="{d}" fill="{cur}"/></svg>\n')

os.makedirs(OUT, exist_ok=True)
files = {
    'symbol.svg': symbol(INK, BLUE),
    'symbol-on-ink.svg': symbol(CREAM, BLUE_ON_INK),
    'favicon.svg': favicon(),
    'logo.svg': lockup(INK, BLUE),
    'logo-on-ink.svg': lockup(CREAM, BLUE_ON_INK),
    '_touch.svg': touch_icon_svg(),
    '_partial.html': ('<span class="logo"><svg class="logo__symbol" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">'
                      + mark('currentColor', 'ACCENT').replace('fill="ACCENT"', 'fill="#2B44D6" style="fill:var(--accent-fg, #2B44D6)"')
                      + '</svg><span class="logo__word">{{site.brand.name}}</span></span>\n'),
}
for name, data in files.items():
    with open(os.path.join(OUT, name), 'w') as fh:
        fh.write(data)
    print(name, len(data))
