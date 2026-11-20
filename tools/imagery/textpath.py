"""Turn a line of text into an SVG path using a variable font instance (fontTools + HarfBuzz)."""
import io, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

_cache = {}

def instance(path, **axes):
    key = (path, tuple(sorted(axes.items())))
    if key not in _cache:
        f = TTFont(path)
        f = instantiateVariableFont(f, axes, inplace=False)
        f.flavor = None
        buf = io.BytesIO(); f.save(buf)
        _cache[key] = (f, buf.getvalue())
    return _cache[key]

def text_path(path, text, size, x=0.0, y=0.0, tracking=0.0, nd=2, **axes):
    """Returns (d, advance_width, metrics). (x, y) is the baseline origin; tracking in em."""
    f, data = instance(path, **axes)
    upm = f['head'].unitsPerEm
    face = hb.Face(data); font = hb.Font(face)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    gs = f.getGlyphSet(); order = f.getGlyphOrder()
    s = size / upm
    pen = SVGPathPen(gs, ntos=lambda v: ('%.*f' % (nd, v)).rstrip('0').rstrip('.') if '.' in ('%.*f' % (nd, v)) else '%.*f' % (nd, v))
    cx = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        t = (s, 0, 0, -s, x + (cx + pos.x_offset) * s, y - pos.y_offset * s)
        gs[name].draw(TransformPen(pen, t))
        cx += pos.x_advance + tracking * upm
    cx -= tracking * upm
    os2 = f['OS/2']
    m = dict(cap=os2.sCapHeight * s, xh=os2.sxHeight * s, asc=f['hhea'].ascent * s, desc=f['hhea'].descent * s)
    return pen.getCommands(), cx * s, m

if __name__ == '__main__':
    d, w, m = text_path(sys.argv[1], 'Smallfold', 100, wght=400, opsz=36)
    print(len(d), round(w, 2), m)
