"""Draws the "chosen by hand" threads illustration. Reproducible: the same seed gives the same file.
Usage: threads.py <out.svg> [--cream] [--seed N]"""
import sys, random, math

out = sys.argv[1]
on_cream = '--cream' in sys.argv
seed = int(sys.argv[sys.argv.index('--seed') + 1]) if '--seed' in sys.argv else 7
rnd = random.Random(seed)

W, H = 1200, 800
LINE = '#0E0E0E' if on_cream else '#F1EFEB'
ACC = '#2B44D6' if on_cream else '#A8B4FF'

N_LEFT, N_RIGHT = 13, 8
XL, XR = 96, 1104
WAIST_X, WAIST_PULL = 0.5, 0.62     # where the bundle gathers, and how strongly (0 = not at all)

def column(n, x, top, bottom, jx, jy):
    step = (bottom - top) / (n - 1)
    return [(x + rnd.uniform(-jx, jx), top + i * step + rnd.uniform(-jy, jy)) for i in range(n)]

left = column(N_LEFT, XL, 84, 716, 22, 9)
right = column(N_RIGHT, XR, 128, 672, 22, 12)

def f(v):
    s = '%.1f' % v
    return s[:-2] if s.endswith('.0') else s

def thread(p0, p1, wobble):
    """Two smooth cubic segments from p0 to p1 through a point near the waist."""
    (x0, y0), (x1, y1) = p0, p1
    xm = x0 + (x1 - x0) * (WAIST_X + rnd.uniform(-0.05, 0.05))
    ym_free = y0 + (y1 - y0) * 0.5
    ym = ym_free + (H / 2 - ym_free) * WAIST_PULL + rnd.uniform(-wobble, wobble)
    slope = (y1 - y0) / (x1 - x0) * 0.55                 # the tangent at the waist leans the way the thread travels
    a = (xm - x0) * rnd.uniform(0.42, 0.56)
    b = (xm - x0) * rnd.uniform(0.34, 0.46)
    c = (x1 - xm) * rnd.uniform(0.42, 0.56)
    c1 = (x0 + a, y0)
    c2 = (xm - b, ym - b * slope)
    c3 = (x1 - c, y1)
    return 'M%s %sC%s %s %s %s %s %sS%s %s %s %s' % tuple(f(v) for v in (x0, y0, *c1, *c2, xm, ym, *c3, x1, y1))

# Which sponsors each channel is weighed against: its nearest few by height, plus now and then a far one.
pairs = []
for i, p in enumerate(left):
    order = sorted(range(N_RIGHT), key=lambda j: abs(right[j][1] - p[1]) + rnd.uniform(0, 150))
    k = rnd.choice([2, 2, 3, 3])
    for j in order[:k]:
        pairs.append((i, j))
    if rnd.random() < 0.3:
        pairs.append((i, rnd.randrange(N_RIGHT)))
pairs = sorted(set(pairs))

CHOSEN = (4, 5)                                           # the match: one channel, one sponsor
pairs = [p for p in pairs if p != CHOSEN]

paths = []
for (i, j) in pairs:
    op = rnd.choice([0.12, 0.16, 0.2, 0.24, 0.3, 0.38])
    sw = rnd.choice([1, 1, 1.25])
    paths.append('<path d="%s" stroke-opacity="%s"%s/>' % (thread(left[i], right[j], 26), op, '' if sw == 1 else ' stroke-width="1.25"'))
def single(p0, p1):
    (x0, y0), (x1, y1) = p0, p1
    d = (x1 - x0) * 0.46
    return 'M%s %sC%s %s %s %s %s %s' % tuple(f(v) for v in (x0, y0, x0 + d, y0, x1 - d, y1, x1, y1))
chosen = single(left[CHOSEN[0]], right[CHOSEN[1]])      # the chosen thread runs in one clean sweep

dots = []
for i, (x, y) in enumerate(left):
    if i != CHOSEN[0]:
        dots.append('<circle cx="%s" cy="%s" r="3"/>' % (f(x), f(y)))
for j, (x, y) in enumerate(right):
    if j != CHOSEN[1]:
        dots.append('<circle cx="%s" cy="%s" r="3"/>' % (f(x), f(y)))
(cx0, cy0), (cx1, cy1) = left[CHOSEN[0]], right[CHOSEN[1]]

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" fill="none">
<!-- Smallfold, "chosen by hand": channels on the left, sponsors on the right, one match picked out. Drawn by script (seed {seed}). -->
<style>path{{vector-effect:non-scaling-stroke}}</style>
<g stroke="{LINE}" stroke-width="1" stroke-linecap="round">
{chr(10).join(paths)}
</g>
<g fill="{LINE}" fill-opacity=".5">
{chr(10).join(dots)}
</g>
<path d="{chosen}" stroke="{ACC}" stroke-width="1.5" stroke-linecap="round"/>
<circle cx="{f(cx0)}" cy="{f(cy0)}" r="5" fill="{ACC}"/>
<circle cx="{f(cx1)}" cy="{f(cy1)}" r="5" fill="{ACC}"/>
</svg>
'''
open(out, 'w').write(svg)
print(out, len(svg), 'bytes,', len(paths) + 1, 'threads')
