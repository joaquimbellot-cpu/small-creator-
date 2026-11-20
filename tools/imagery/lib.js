// A small scene kit: a desk seen from above, paper sheets and simple objects, lit by window light.
// Everything is drawn as SVG: an "albedo" layer (surface colours and cast shadows) multiplied by a "light map".
const INK = '#0E0E0E', CREAM = '#F1EFEB', BLUE = '#2B44D6';

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const n = v => +v.toFixed(2);
const pts = a => a.map(p => `${n(p[0])},${n(p[1])}`).join(' ');

class Scene {
  constructor(w, h, opt = {}) {
    this.w = w; this.h = h;
    this.o = Object.assign({ desk: '#8A7E70', ambient: '#3A352F', light: '#FFF1DB', sun: [0.55, 0.85], vignette: 0.55, texture: 0.5 }, opt);
    this.items = []; this.lights = []; this.defs = []; this.id = 0;
  }
  blur(sd) { const id = 'b' + (this.id++); this.defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`); return id; }
  // z = height above the desk: sets how far the shadow falls and how soft it is.
  shadow(shape, z, strength = 0.55) {
    const [sx, sy] = this.o.sun; const dx = sx * z, dy = sy * z;
    const far = this.blur(Math.max(2, z * 0.55)), near = this.blur(Math.max(1.2, z * 0.12));
    return `<g transform="translate(${n(dx)} ${n(dy)})" filter="url(#${far})" opacity="${strength}">${shape('#000')}</g>` +
           `<g transform="translate(${n(dx * 0.18)} ${n(dy * 0.18)})" filter="url(#${near})" opacity="${strength * 0.7}">${shape('#000')}</g>`;
  }
  wrap(inner, { x, y, rot = 0, dof = 0 }) {
    const f = dof ? ` filter="url(#${this.blur(dof)})"` : '';
    return `<g${f}><g transform="translate(${n(x)} ${n(y)}) rotate(${rot})">${inner}</g></g>`;
  }
  // A sheet of paper, centred on (x, y). fold = size of the folded top-right corner; foldColor paints the flap.
  sheet({ x, y, w, h = w, rot = 0, z = 5, fill = CREAM, fold = 0, foldColor = null, dof = 0, shade = 0.55 }) {
    const L = -w / 2, T = -h / 2, R = w / 2, B = h / 2;
    const outline = fold ? [[L, T], [R - fold, T], [R, T + fold], [R, B], [L, B]] : [[L, T], [R, T], [R, B], [L, B]];
    const shape = c => `<polygon points="${pts(outline)}" fill="${c}"/>`;
    let s = this.shadow(shape, z, shade) + shape(fill);
    if (fold) {
      const flap = [[R - fold, T], [R - fold, T + fold], [R, T + fold]];
      const fs = c => `<polygon points="${pts(flap)}" fill="${c}"/>`;
      s += `<g opacity=".8">${this.shadow(fs, Math.max(2, fold * 0.07), 0.5)}</g>` + fs(foldColor || '#DDD8CE');
    }
    this.items.push(this.wrap(s, { x, y, rot, dof })); return this;
  }
  // A round object (lens, lid, tin) seen from above.
  disc({ x, y, r, z = 30, fill = '#1A1917', rings = [], dof = 0, shade = 0.6 }) {
    const [sx, sy] = this.o.sun;
    const steps = 16; let capS = '';
    for (let i = 0; i <= steps; i++) capS += `<circle cx="${n(sx * z * i / steps)}" cy="${n(sy * z * i / steps)}" r="${r}"/>`;
    const cap = c => `<g fill="${c}">${capS}</g>`;
    const soft = this.blur(Math.max(3, z * 0.16));
    let s = `<g filter="url(#${soft})" opacity="${shade}">${cap('#000')}</g><circle r="${r}" fill="${fill}"/>`;
    for (const [rr, col, sw = 2, op = 1] of rings) s += `<circle r="${rr}" fill="none" stroke="${col}" stroke-width="${sw}" opacity="${op}"/>`;
    this.items.push(this.wrap(s, { x, y, dof })); return this;
  }
  // A box seen from above; z is its height.
  box({ x, y, w, h, rot = 0, z = 40, fill = '#CFC8BB', dof = 0, shade = 0.6, inset = null }) {
    const [sx0, sy0] = this.o.sun; const a = -rot * Math.PI / 180;
    const sx = sx0 * Math.cos(a) - sy0 * Math.sin(a), sy = sx0 * Math.sin(a) + sy0 * Math.cos(a);   // sun direction in the box's own frame
    const L = -w / 2, T = -h / 2;
    const soft = this.blur(Math.max(3, z * 0.2));
    const steps = 14; let sh = '';
    for (let i = 0; i <= steps; i++) sh += `<rect x="${n(L + sx * z * i / steps)}" y="${n(T + sy * z * i / steps)}" width="${w}" height="${h}" fill="#000"/>`;
    let s = `<g filter="url(#${soft})" opacity="${shade}">${sh}</g><rect x="${L}" y="${T}" width="${w}" height="${h}" fill="${fill}"/>`;
    if (inset) s += `<rect x="${L + inset}" y="${T + inset}" width="${w - 2 * inset}" height="${h - 2 * inset}" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="2"/>`;
    this.items.push(this.wrap(s, { x, y, rot, dof })); return this;
  }
  // A pen lying on the desk.
  pen({ x, y, len, rot = 0, thick = 16, body = '#16161A', tip = BLUE, dof = 0 }) {
    const shape = c => `<rect x="${-len / 2}" y="${-thick / 2}" width="${len}" height="${thick}" rx="${thick / 2}" fill="${c}"/>`;
    let s = this.shadow(shape, thick * 0.9, 0.6) + shape(body) +
      `<rect x="${-len / 2}" y="${-thick / 2}" width="${len * 0.2}" height="${thick}" rx="${thick / 2}" fill="${tip}"/>` +
      `<rect x="${-len / 2 + len * 0.06}" y="${-thick / 2 + thick * 0.2}" width="${len * 0.86}" height="${thick * 0.14}" rx="${thick * 0.07}" fill="#fff" opacity=".16"/>`;
    this.items.push(this.wrap(s, { x, y, rot, dof })); return this;
  }
  raw(svg) { this.items.push(svg); return this; }
  // Window light: a slanted set of panes. (x, y) top-left of the pattern, cols x rows panes, skewed.
  window({ x, y, pw, ph, cols = 2, rows = 2, gap = 30, skew = -24, rot = 0, soft = 16, strength = 1 }) {
    const f = this.blur(soft); let s = '';
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++)
      s += `<rect x="${n(c * (pw + gap))}" y="${n(r * (ph + gap))}" width="${pw}" height="${ph}"/>`;
    this.lights.push(`<g filter="url(#${f})" opacity="${strength}" fill="${this.o.light}" transform="translate(${n(x)} ${n(y)}) rotate(${rot}) skewX(${skew})">${s}</g>`); return this;
  }
  glow({ x, y, rx, ry = rx, strength = 0.5 }) {
    const id = 'g' + (this.id++);
    this.defs.push(`<radialGradient id="${id}"><stop offset="0" stop-color="${this.o.light}" stop-opacity="${strength}"/><stop offset="1" stop-color="${this.o.light}" stop-opacity="0"/></radialGradient>`);
    this.lights.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`); return this;
  }
  svg() {
    const { w, h, o } = this;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">
<defs>${this.defs.join('')}
<filter id="tex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.35" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${o.texture} -${o.texture * 0.42}"/></filter>
<radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${o.vignette}"/></radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="${o.desk}"/>
<rect width="${w}" height="${h}" filter="url(#tex)" opacity=".5"/>
${this.items.join('\n')}
<g style="mix-blend-mode:multiply"><rect width="${w}" height="${h}" fill="${o.ambient}"/>${this.lights.join('')}</g>
<rect width="${w}" height="${h}" fill="url(#vig)"/>
</svg>`;
  }
}
module.exports = { Scene, mulberry, INK, CREAM, BLUE };
