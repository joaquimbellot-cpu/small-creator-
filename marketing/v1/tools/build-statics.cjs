// Builds the static ads from marketing/v1/tools/statics.json.
// Pictures: the website's own Higgsfield pictures (src/assets/img). Type and logo are set here, never generated.
// Run: FONT_DIR=<folder holding @fontsource> node marketing/v1/tools/build-statics.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..', '..');
const fontDir = process.env.FONT_DIR;
if (!fontDir) { console.error('Set FONT_DIR to a node_modules/@fontsource folder.'); process.exit(1); }
const b64 = (p) => fs.readFileSync(p).toString('base64');
const font = (pkg, file) => `url(data:font/woff2;base64,${b64(path.join(fontDir, pkg, 'files', file))}) format('woff2')`;
const fonts = `
@font-face{font-family:Newsreader;font-weight:300;font-style:normal;src:${font('newsreader', 'newsreader-latin-300-normal.woff2')}}
@font-face{font-family:Newsreader;font-weight:300;font-style:italic;src:${font('newsreader', 'newsreader-latin-300-italic.woff2')}}
@font-face{font-family:Newsreader;font-weight:400;font-style:normal;src:${font('newsreader', 'newsreader-latin-400-normal.woff2')}}
@font-face{font-family:"Instrument Sans";font-weight:500;src:${font('instrument-sans', 'instrument-sans-latin-500-normal.woff2')}}
@font-face{font-family:"Instrument Sans";font-weight:600;src:${font('instrument-sans', 'instrument-sans-latin-600-normal.woff2')}}`;
const logo = fs.readFileSync(path.join(root, 'src/assets/logo/logo-on-ink.svg'), 'utf8').replace(/<svg /, '<svg class="logo" ');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rich = (s) => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

function html(ad, w, h) {
  const tall = h > w;
  const img = `data:image/jpeg;base64,${b64(path.join(root, ad.image))}`;
  const u = w / 1080; // one unit
  return `<!doctype html><meta charset="utf-8"><style>${fonts}
*{box-sizing:border-box;margin:0}
body{width:${w}px;height:${h}px;overflow:hidden;background:#0E0E0E;color:#F1EFEB;font-family:"Instrument Sans",sans-serif;font-weight:500}
.bg{position:absolute;inset:0;background:url(${img}) ${(tall ? ad.focusTall : ad.focus) || '50% 50%'}/cover no-repeat;transform:scale(${(tall ? ad.zoomTall : ad.zoom) || 1});transform-origin:${(tall ? ad.focusTall : ad.focus) || '50% 50%'}}
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,14,14,.78) 0%,rgba(14,14,14,.5) 14%,rgba(14,14,14,.14) 30%,rgba(14,14,14,.2) 42%,rgba(14,14,14,${ad.veil || .8}) 62%,rgba(14,14,14,.92) 80%,rgba(14,14,14,.96) 100%)}
.logo{position:absolute;left:${72 * u}px;top:${(tall ? 192 : 64) * u}px;height:${46 * u}px;width:auto}
.block{position:absolute;left:${72 * u}px;right:${72 * u}px;bottom:${(tall ? 330 : 84) * u}px}
h1{font-family:Newsreader,serif;font-weight:300;font-size:${(tall ? 112 : 96) * u * (ad.scale || 1)}px;line-height:1.02;letter-spacing:-.015em;text-wrap:balance}
h1 em{font-style:italic;color:#A8B4FF}
.sub{margin-top:${26 * u}px;font-size:${(tall ? 36 : 31) * u}px;line-height:1.3;opacity:.9;max-width:${880 * u}px;text-wrap:balance}
.row{margin-top:${40 * u}px;display:flex;align-items:center;gap:${28 * u}px}
.btn{background:#F1EFEB;color:#0E0E0E;font-weight:600;font-size:${30 * u}px;padding:${17 * u}px ${44 * u}px;border-radius:999px;display:flex;align-items:center;gap:${14 * u}px}
.btn i{width:${12 * u}px;height:${12 * u}px;border-radius:50%;background:#2B44D6;display:block}
.foot{font-size:${28 * u}px;opacity:.9;line-height:1.3}
.ai{position:absolute;right:${72 * u}px;top:${(tall ? 200 : 72) * u}px;font-size:${27 * u}px;opacity:.92;letter-spacing:.01em;text-shadow:0 0 ${14 * u}px rgba(14,14,14,.9),0 0 ${4 * u}px rgba(14,14,14,.8)}
</style><div class="bg"></div><div class="veil"></div>${logo}<div class="ai">Image made with AI</div>
<div class="block"><h1>${rich(ad.headline)}</h1><p class="sub">${rich(ad.sub)}</p>
<div class="row"><span class="btn"><i></i>Apply</span><span class="foot">${rich(ad.footer)}</span></div></div>`;
}

(async () => {
  const ads = JSON.parse(fs.readFileSync(path.join(__dirname, 'statics.json'), 'utf8'));
  const out = path.join(root, 'marketing/v1/assets/static');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const ad of ads) {
    for (const [name, w, h] of [['1x1', 1080, 1080], ['9x16', 1080, 1920]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.setContent(html(ad, w, h));
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(out, `${ad.id}_${name}.png`);
      await page.screenshot({ path: file });
      await page.close();
      console.log('wrote', path.relative(root, file));
    }
  }
  await browser.close();
})();
