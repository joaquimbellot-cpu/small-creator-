// Version 2 static ads. Pictures come from Higgsfield (marketing/v2/assets/source/).
// Every word, the blank, the button and the logo are set here, never generated.
// Run: FONT_DIR=<folder holding @fontsource> node marketing/v2/tools/build-statics.cjs [ad id]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..', '..');
const fontDir = process.env.FONT_DIR;
if (!fontDir) { console.error('Set FONT_DIR to a node_modules/@fontsource folder.'); process.exit(1); }
const b64 = (p) => fs.readFileSync(p).toString('base64');
const font = (w) => `url(data:font/woff2;base64,${b64(path.join(fontDir, 'inter/files', `inter-latin-${w}-normal.woff2`))}) format('woff2')`;
const logo = fs.readFileSync(path.join(root, 'src/assets/logo/logo.svg'), 'utf8').replace(/<svg /, '<svg class="logo" ');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// "____" becomes the campaign's blank: a thick pen-blue underline that is never filled.
const rich = (s) => esc(s).replace(/(\S+) _{3,}/g, '<b class="nw">$1<i class="blank"></i></b>').replace(/_{3,}/g, '<i class="blank"></i>').replace(/\n/g, '<br>');
const mime = (f) => (f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

function item(it) {
  const st = [];
  if (it.rotate) st.push(`transform:rotate(${it.rotate}deg)`);
  if (it.size) st.push(`font-size:calc(var(--u) * ${it.size})`);
  if (it.gap != null) st.push(`margin-top:calc(var(--u) * ${it.gap})`);
  return `<div class="it ${it.type}" style="${st.join(';')}"><span>${rich(it.text)}</span></div>`;
}
function stack(s) {
  const pos = [`left:${s.x}%`, s.bottom != null ? `bottom:${s.bottom}%` : `top:${s.y}%`, `width:${s.w || 80}%`];
  return `<div class="stack ${s.align || ''}" style="${pos.join(';')}">${s.items.map(item).join('')}</div>`;
}
function html(ad, fmt, w, h) {
  const f = ad[fmt];
  const img = `data:${mime(ad.image)};base64,${b64(path.join(root, ad.image))}`;
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:800;src:${font(800)}}
@font-face{font-family:Inter;font-weight:900;src:${font(900)}}
*{box-sizing:border-box;margin:0}
body{--u:${h / 100}px;width:${w}px;height:${h}px;overflow:hidden;background:#F1EFEB;font-family:Inter,sans-serif;font-weight:800;color:#0E0E0E}
.bg{position:absolute;inset:0;background:url(${img}) ${f.focus || '50% 50%'}/cover no-repeat;transform:scale(${f.zoom || 1});transform-origin:${f.focus || '50% 50%'}}
.stack{position:absolute;display:flex;flex-direction:column;align-items:flex-start}
.stack.right{align-items:flex-end}.stack.center{align-items:center;text-align:center}
.it{margin-top:calc(var(--u) * .9);line-height:1.12}
.it:first-child{margin-top:0}
.it span{display:inline-block;padding:.2em .42em;border-radius:.3em}
.headline{font-weight:900;font-size:calc(var(--u) * ${fmt === 'sq' ? 4.1 : 2.9})}
.headline span{background:#FFD21F}
.caption{font-weight:900;font-size:calc(var(--u) * ${fmt === 'sq' ? 5.2 : 3.3})}
.caption span{background:#F1EFEB}
.chip{font-size:calc(var(--u) * ${fmt === 'sq' ? 3.0 : 1.9})}
.chip span{background:#2B44D6;color:#F1EFEB;border-radius:99em;padding:.3em .8em}
.stamp{font-weight:900;font-size:calc(var(--u) * ${fmt === 'sq' ? 4.6 : 3.0})}
.stamp span{background:#FF6B57;border:.12em solid #0E0E0E}
.label{font-size:calc(var(--u) * ${fmt === 'sq' ? 2.5 : 1.55})}
.label span{background:#F1EFEB;border:.14em solid #0E0E0E;border-radius:99em;padding:.22em .7em}
.label.pretend span{background:#FF6B57}
.small{font-size:calc(var(--u) * ${fmt === 'sq' ? 2.7 : 1.7})}
.small span{background:#F1EFEB}
.button{font-weight:900;font-size:calc(var(--u) * ${fmt === 'sq' ? 4.0 : 2.7})}
.button span{background:#2B44D6;color:#F1EFEB;border-radius:99em;padding:.34em 1.5em}
.nw{white-space:nowrap;font-weight:inherit}
.blank{display:inline-block;width:2.4em;height:.17em;background:#2B44D6;vertical-align:baseline;margin-left:.12em;border-radius:.05em}
.chip .blank,.button .blank{background:#F1EFEB}
.logoplate{position:absolute;background:#F1EFEB;border-radius:calc(var(--u) * 1.2);padding:calc(var(--u) * .7) calc(var(--u) * 1.1);line-height:0}
.logo{height:calc(var(--u) * ${fmt === 'sq' ? 3.6 : 2.3});width:auto}
</style><div class="bg"></div>
<div class="logoplate" style="${f.logo || 'right:5%;top:5%'}">${logo}</div>
${f.stacks.map(stack).join('')}`;
}

(async () => {
  const ads = JSON.parse(fs.readFileSync(path.join(__dirname, 'statics.json'), 'utf8'));
  const only = process.argv[2];
  const out = path.join(root, 'marketing/v2/assets/static');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const ad of ads) {
    if (only && ad.id !== only) continue;
    for (const [fmt, name, w, h] of [['sq', '1x1', 1080, 1080], ['tall', '9x16', 1080, 1920]]) {
      if (!ad[fmt]) continue;
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.setContent(html(ad, fmt, w, h));
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(out, `${ad.id}_${name}.png`);
      await page.screenshot({ path: file });
      await page.close();
      console.log('wrote', path.relative(root, file));
    }
  }
  await browser.close();
})();
