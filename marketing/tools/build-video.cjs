// Builds the caption-led 9:16 video cuts from marketing/tools/videos.json.
// Pictures: the website's own Higgsfield pictures. Type, logo and motion are set here. No sound is added.
// Run: FONT_DIR=<folder holding @fontsource> node marketing/tools/build-video.cjs [video id]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const fontDir = process.env.FONT_DIR;
if (!fontDir) { console.error('Set FONT_DIR to a node_modules/@fontsource folder.'); process.exit(1); }
const FPS = 30, W = 1080, H = 1920;
const b64 = (p) => fs.readFileSync(p).toString('base64');
const font = (pkg, file) => `url(data:font/woff2;base64,${b64(path.join(fontDir, pkg, 'files', file))}) format('woff2')`;
const fonts = `
@font-face{font-family:Newsreader;font-weight:300;font-style:normal;src:${font('newsreader', 'newsreader-latin-300-normal.woff2')}}
@font-face{font-family:Newsreader;font-weight:300;font-style:italic;src:${font('newsreader', 'newsreader-latin-300-italic.woff2')}}
@font-face{font-family:"Instrument Sans";font-weight:500;src:${font('instrument-sans', 'instrument-sans-latin-500-normal.woff2')}}
@font-face{font-family:"Instrument Sans";font-weight:600;src:${font('instrument-sans', 'instrument-sans-latin-600-normal.woff2')}}`;
const svg = (name, cls) => fs.readFileSync(path.join(root, 'src/assets/logo', name), 'utf8').replace(/<svg /, `<svg class="${cls}" `);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rich = (s) => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');

function html(video) {
  const beats = video.beats.map((b, i) => {
    if (b.end) {
      return `<section class="beat end" data-i="${i}">${svg('logo.svg', 'endlogo')}
<div class="endblock"><h2 class="line">${rich(b.title).replace(/\n/g, '<br>')}</h2><p class="line endsub">${rich(b.sub)}</p>
<div class="line"><span class="btn"><i></i>Apply</span></div><p class="line url">${esc(b.url)}</p></div></section>`;
    }
    const img = `data:image/jpeg;base64,${b64(path.join(root, b.image))}`;
    const lines = b.text.split('\n').map((l) => `<span class="mask"><span class="line">${rich(l)}</span></span>`).join('');
    const small = b.small ? `<p class="line small">${rich(b.small)}</p>` : '';
    const tag = b.tag ? `<p class="line tag">${esc(b.tag)}</p>` : '';
    return `<section class="beat" data-i="${i}"><div class="bg" style="background-image:url(${img});background-position:${b.focus || '50% 50%'};transform-origin:${b.focus || '50% 50%'}"></div>
<div class="veil"></div><div class="text ${b.big ? 'big' : ''}">${tag}<h1>${lines}</h1>${small}</div></section>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><style>${fonts}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;overflow:hidden;background:#0E0E0E;color:#F1EFEB;font-family:"Instrument Sans",sans-serif;font-weight:500}
.beat{position:absolute;inset:0;opacity:0;overflow:hidden}
.bg{position:absolute;inset:0;background-size:cover;background-repeat:no-repeat}
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,14,14,.66) 0%,rgba(14,14,14,.2) 24%,rgba(14,14,14,.34) 45%,rgba(14,14,14,.86) 74%,rgba(14,14,14,.95) 100%)}
.text{position:absolute;left:76px;right:76px;bottom:420px}
h1{font-family:Newsreader,serif;font-weight:300;font-size:104px;line-height:1.04;letter-spacing:-.015em}
.big h1{font-size:132px;line-height:1}
h1 em,h2 em{font-style:italic;color:#A8B4FF}
.mask{display:block;overflow:hidden;padding-bottom:.14em;margin-bottom:-.14em}
.line{display:block;will-change:transform,opacity}
.small{margin-top:34px;font-size:40px;line-height:1.3;opacity:.92}
.tag{margin-bottom:28px;font-size:30px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#A8B4FF}
.top{position:absolute;left:76px;right:76px;top:150px;display:flex;justify-content:space-between;align-items:center;z-index:5}
.logo{height:50px;width:auto}
.ai{font-size:24px;opacity:.75;letter-spacing:.02em}
.end{background:#F1EFEB;color:#0E0E0E}
.endlogo{position:absolute;left:76px;top:150px;height:50px;width:auto}
.endblock{position:absolute;left:76px;right:76px;top:620px}
h2{font-family:Newsreader,serif;font-weight:300;font-size:128px;line-height:1.02;letter-spacing:-.015em}
.end h2 em{color:#2B44D6}
.endsub{margin-top:36px;font-size:42px;line-height:1.3;color:#5C5A55}
.btn{margin-top:64px;display:inline-flex;align-items:center;gap:20px;background:#0E0E0E;color:#F1EFEB;font-weight:600;font-size:52px;padding:30px 84px;border-radius:999px}
.btn i{width:18px;height:18px;border-radius:50%;background:#A8B4FF;display:block}
.url{margin-top:44px;font-size:36px;font-weight:600}
.aiend{position:absolute;right:76px;top:162px;font-size:24px;color:#5C5A55}
</style>${beats}
<div class="top" id="top">${svg('logo-on-ink.svg', 'logo')}<span class="ai">Made with AI</span></div>
<span class="aiend" id="aiend" style="opacity:0">Made with AI</span>
<script>
const B = ${JSON.stringify(video.beats.map((b) => ({ t0: b.t0, t1: b.t1, end: !!b.end })))};
const FADE = 0.45, clamp = (x) => Math.max(0, Math.min(1, x));
const out = (x) => 1 - Math.pow(1 - clamp(x), 3);
const secs = [...document.querySelectorAll('.beat')];
window.render = (t) => {
  let endOn = 0;
  secs.forEach((s, i) => {
    const b = B[i];
    // each beat fades in over the previous one; the first is fully there at frame 0
    const a = i === 0 ? 1 : clamp((t - b.t0) / FADE);
    const visible = t >= b.t0 - 0.001 && (i === secs.length - 1 || t < B[i + 1].t0 + FADE);
    s.style.opacity = visible ? a : 0;
    s.style.zIndex = i + 1;
    if (b.end) endOn = visible ? a : 0;
    const bg = s.querySelector('.bg');
    if (bg) bg.style.transform = 'scale(' + (1.02 + 0.07 * clamp((t - b.t0) / (b.t1 - b.t0 + FADE))) + ')';
    s.querySelectorAll('.line').forEach((l, k) => {
      const start = b.t0 + (i === 0 ? 0 : 0.18) + k * 0.13;
      const p = i === 0 && k === 0 ? 1 : out((t - start) / 0.55);
      // the words leave just before the next picture arrives, so two texts never overlap
      const leave = i === secs.length - 1 ? 1 : clamp((b.t1 - t) / 0.3);
      l.style.opacity = p * leave;
      l.style.transform = 'translateY(' + (1 - p) * 60 + 'px)';
    });
  });
  document.getElementById('top').style.opacity = 1 - endOn;
  document.getElementById('aiend').style.opacity = endOn;
};
</script>`;
}

(async () => {
  const all = JSON.parse(fs.readFileSync(path.join(__dirname, 'videos.json'), 'utf8'));
  const only = process.argv[2];
  const out = path.join(root, 'marketing/assets/video');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const video of all) {
    if (only && video.id !== only) continue;
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(html(video));
    await page.evaluate(() => document.fonts.ready);
    const total = video.beats[video.beats.length - 1].t1;
    const file = path.join(out, `${video.id}_9x16.mp4`);
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', file],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    const frames = Math.round(total * FPS);
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t) => window.render(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    await page.close();
    console.log('wrote', path.relative(root, file), frames, 'frames');
  }
  await browser.close();
})();
