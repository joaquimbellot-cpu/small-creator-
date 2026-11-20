"""gen_finish.py <png_dir> <out_dir> [name ...] : adds film grain to the rendered scenes and saves them at the slot paths (+ -small)."""
import os, sys
import numpy as np
from PIL import Image, ImageFilter
png_dir, out_dir = sys.argv[1:3]; only = set(sys.argv[3:])
SLOTS = {  # name: (file, small width, size limit KB)
    'hero': ('hero.jpg', 1200, 450), 'heroTall': ('hero-tall.jpg', 600, 300), 'band': ('band.jpg', 1200, 450),
    'difference1': ('difference-1.jpg', 600, 300), 'difference2': ('difference-2.jpg', 600, 300), 'difference3': ('difference-3.jpg', 600, 300),
    'brands': ('brands.jpg', 1200, 300), 'about': ('about.jpg', 1200, 300),
}
def grain(im, seed, amount=0.022):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255.0
    rng = np.random.default_rng(seed)
    n = rng.normal(0, 1, a.shape[:2]).astype(np.float32)
    n = np.asarray(Image.fromarray(((n * 40) + 128).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 40 - 3.2
    luma = a.mean(axis=2)
    w = amount * (0.55 + 0.9 * (1 - np.abs(luma - 0.45) * 1.6).clip(0, 1))     # strongest in the mid-tones, like film
    a = a + (n * w)[..., None]
    return Image.fromarray((a.clip(0, 1) * 255 + 0.5).astype(np.uint8))
def save(im, path, limit_kb, q=82):
    while True:
        im.save(path, 'JPEG', quality=q, optimize=True, progressive=True, subsampling='4:2:0')
        kb = os.path.getsize(path) / 1024
        if kb <= limit_kb or q <= 62: return q, kb
        q -= 3
for i, (name, (file, sw, lim)) in enumerate(SLOTS.items()):
    if only and name not in only: continue
    im = grain(Image.open(os.path.join(png_dir, name + '.png')), 100 + i)
    q, kb = save(im, os.path.join(out_dir, file), lim)
    small = im.resize((sw, round(im.height * sw / im.width)), Image.LANCZOS)
    q2, kb2 = save(small, os.path.join(out_dir, file.replace('.jpg', '-small.jpg')), 160, 80)
    print('%-12s %dx%d q%d %.0f KB | small %dx%d %.0f KB' % (name, im.width, im.height, q, kb, small.width, small.height, kb2))
