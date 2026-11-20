const { Scene, mulberry, CREAM, BLUE } = require('./lib.js');
// Every scene: a dim desk seen from above, cream paper, window light from the upper left, one pen-blue fold.
const PAPER = ['#F1EFEB', '#ECE8E0', '#E6E1D7'];
const OPT = { sun: [0.55, 0.8], ambient: '#46403A' };

module.exports = {
  // Wide desk: light on the left, papers at the edges, the middle left empty for the headline.
  hero() {
    const s = new Scene(2400, 1350, OPT);
    s.window({ x: 150, y: -420, pw: 430, ph: 620, cols: 3, rows: 2, gap: 46, skew: -28, rot: 14, soft: 22, strength: 0.95 });
    s.glow({ x: 1200, y: 600, rx: 1500, ry: 900, strength: 0.14 });
    s.sheet({ x: 250, y: 1080, w: 560, h: 720, rot: -14, z: 8, fill: PAPER[2], dof: 3 });
    s.sheet({ x: 300, y: 1040, w: 560, h: 720, rot: -9, z: 8, fill: PAPER[1], dof: 2 });
    s.sheet({ x: 345, y: 1010, w: 560, h: 720, rot: -5, z: 10, fill: PAPER[0] });
    s.sheet({ x: 2130, y: 250, w: 620, h: 800, rot: 11, z: 9, fill: PAPER[1], dof: 2 });
    s.sheet({ x: 430, y: 300, w: 290, rot: 8, z: 14, fill: PAPER[0], fold: 108, foldColor: BLUE });
    s.pen({ x: 2040, y: 1150, len: 470, rot: -20, thick: 20, dof: 2 });
    return s;
  },
  heroTall() {
    const s = new Scene(1200, 1500, OPT);
    s.window({ x: -260, y: -380, pw: 400, ph: 560, cols: 3, rows: 2, gap: 42, skew: -28, rot: 14, soft: 20, strength: 0.95 });
    s.glow({ x: 600, y: 700, rx: 1000, ry: 1000, strength: 0.14 });
    s.sheet({ x: 120, y: 1300, w: 520, h: 680, rot: -12, z: 8, fill: PAPER[2], dof: 3 });
    s.sheet({ x: 170, y: 1270, w: 520, h: 680, rot: -6, z: 10, fill: PAPER[0] });
    s.sheet({ x: 1090, y: 150, w: 520, h: 680, rot: 11, z: 9, fill: PAPER[1], dof: 2 });
    s.sheet({ x: 300, y: 290, w: 260, rot: 8, z: 14, fill: PAPER[0], fold: 97, foldColor: BLUE });
    s.pen({ x: 880, y: 1300, len: 420, rot: -20, thick: 18, dof: 2 });
    return s;
  },
  // Close detail: a fanned stack of sheets, their edges catching the light.
  band() {
    const s = new Scene(2400, 1200, OPT);
    s.window({ x: 700, y: -500, pw: 520, ph: 900, cols: 3, rows: 2, gap: 60, skew: -30, rot: 8, soft: 34, strength: 0.9 });
    s.glow({ x: 1200, y: 600, rx: 1400, ry: 800, strength: 0.12 });
    for (let i = 0; i < 9; i++) s.sheet({ x: 2900 - i * 22, y: 1500 - i * 30, w: 2600, h: 1800, rot: -34 + i * 3.1, z: 10, fill: PAPER[i % 3], dof: i < 3 ? 5 : i < 6 ? 2 : 0 });
    for (let i = 0; i < 5; i++) s.sheet({ x: -620 + i * 16, y: -360 + i * 24, w: 2200, h: 1500, rot: 152 + i * 3.4, z: 9, fill: PAPER[(i + 1) % 3], dof: 6 - i });
    return s;
  },
  // Matched by hand: a loose grid of small cards, one lifted out and marked.
  difference1() {
    const s = new Scene(1200, 1500, OPT); const r = mulberry(11);
    s.window({ x: 330, y: 140, pw: 420, ph: 520, cols: 2, rows: 2, gap: 40, skew: -24, rot: 12, soft: 20, strength: 0.95 });
    s.glow({ x: 600, y: 750, rx: 900, ry: 1000, strength: 0.12 });
    const cols = 4, rows = 5, cw = 190, gx = 262, gy = 268, ox = 207, oy = 214;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (i === 2 && j === 2) continue;
      s.sheet({ x: ox + i * gx + (r() - 0.5) * 22, y: oy + j * gy + (r() - 0.5) * 22, w: cw, rot: (r() - 0.5) * 9, z: 5, fill: PAPER[Math.floor(r() * 3)], dof: j === 0 || j === rows - 1 ? 1.5 : 0 });
    }
    s.sheet({ x: ox + 2 * gx + 26, y: oy + 2 * gy - 30, w: cw + 26, rot: 9, z: 22, fill: PAPER[0], fold: 82, foldColor: BLUE });
    return s;
  },
  // Only small channels: one small sheet in a pool of light, a large one leaving the frame.
  difference2() {
    const s = new Scene(1200, 1500, OPT);
    s.window({ x: 60, y: 330, pw: 360, ph: 440, cols: 2, rows: 2, gap: 36, skew: -24, rot: 12, soft: 22, strength: 0.95 });
    s.glow({ x: 600, y: 800, rx: 900, ry: 1000, strength: 0.12 });
    s.sheet({ x: 1130, y: 180, w: 900, h: 1150, rot: 14, z: 9, fill: PAPER[2], dof: 4 });
    s.sheet({ x: 560, y: 830, w: 250, rot: -6, z: 14, fill: PAPER[0], fold: 94, foldColor: BLUE });
    return s;
  },
  // You have the final say: two sheets, one set aside, one kept; a pen beside it.
  difference3() {
    const s = new Scene(1200, 1500, OPT);
    s.window({ x: 220, y: 300, pw: 400, ph: 520, cols: 2, rows: 2, gap: 40, skew: -24, rot: 12, soft: 20, strength: 0.95 });
    s.glow({ x: 600, y: 750, rx: 900, ry: 1000, strength: 0.12 });
    s.sheet({ x: 190, y: 420, w: 460, h: 600, rot: -17, z: 7, fill: PAPER[2], dof: 3 });
    s.sheet({ x: 690, y: 860, w: 470, h: 610, rot: 5, z: 12, fill: PAPER[0], fold: 120, foldColor: BLUE });
    s.pen({ x: 500, y: 1290, len: 430, rot: -8, thick: 20 });
    return s;
  },
  // For brands: plain objects set out on the table, seen from above.
  brands() {
    const s = new Scene(1800, 1200, OPT);
    s.window({ x: 380, y: -360, pw: 430, ph: 600, cols: 3, rows: 2, gap: 46, skew: -28, rot: 14, soft: 22, strength: 0.95 });
    s.glow({ x: 900, y: 600, rx: 1200, ry: 800, strength: 0.12 });
    s.sheet({ x: 420, y: 760, w: 520, h: 680, rot: -8, z: 7, fill: PAPER[1] });
    s.box({ x: 1010, y: 520, w: 330, h: 330, rot: 9, z: 120, fill: '#D8D1C4', inset: 26 });
    s.disc({ x: 1400, y: 820, r: 105, z: 150, fill: '#CFC8BB', rings: [[84, '#000', 2, 0.12]] });
    s.disc({ x: 700, y: 330, r: 62, z: 60, fill: '#1B1A18', rings: [[44, '#fff', 2, 0.14]] });
    s.sheet({ x: 1330, y: 250, w: 230, rot: 12, z: 12, fill: PAPER[0], fold: 86, foldColor: BLUE });
    return s;
  },
  // About: a notebook and a lens on a desk by the window.
  about() {
    const s = new Scene(1800, 1200, OPT);
    s.window({ x: 120, y: -420, pw: 470, ph: 640, cols: 3, rows: 2, gap: 50, skew: -28, rot: 14, soft: 24, strength: 0.95 });
    s.glow({ x: 900, y: 600, rx: 1200, ry: 800, strength: 0.12 });
    s.sheet({ x: 1180, y: 700, w: 600, h: 800, rot: 8, z: 16, fill: '#1C1B19' });
    s.sheet({ x: 1168, y: 690, w: 560, h: 760, rot: 8, z: 3, fill: PAPER[0], fold: 150, foldColor: BLUE, shade: 0.3 });
    s.disc({ x: 520, y: 700, r: 150, z: 170, fill: '#161514', rings: [[128, '#fff', 3, 0.10], [96, '#fff', 2, 0.08], [60, '#2a2c36', 26, 1], [30, '#fff', 2, 0.10]] });
    s.pen({ x: 880, y: 1040, len: 420, rot: -14, thick: 18, dof: 1.5 });
    return s;
  },
};
