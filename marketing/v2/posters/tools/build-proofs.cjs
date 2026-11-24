// Builds src/proof-*.html from src/_template.html by filling its slots.
// Usage: node tools/build-proofs.cjs
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'src');
const tpl = fs.readFileSync(path.join(src, '_template.html'), 'utf8');

function build(name, title, theme, css, content, ai) {
  let h = tpl;
  h = h.replace('<title>Poster template</title>', `<title>${title}</title>`);
  h = h.replace('poster t-cream"><!--THEME_MARK-->', `poster ${theme}">`);
  h = h.replace('/*EXTRA_CSS*/', css);
  h = h.replace('<!--CONTENT-->\n', content + '\n');
  h = h.replace('<!--AI-->', ai ? '<span class="ai">Image made with AI</span>' : '');
  fs.writeFileSync(path.join(src, name + '.html'), h);
}

/* ---------- A: type monument ---------- */
build('proof-a', 'Proof A - Monument', 't-yellow', `
.mono{display:flex;flex-direction:column;gap:8px}
.mono .ln{display:block}
.mono .l1{font-size:198px}
.mono .l2{font-size:226px}
.mono .l3{font-size:226px}
.mono .blank{display:block;width:100%;height:250px;margin-top:26px;--br:.02em}
.stage{justify-content:space-between}
html.f-9x16 .mono{gap:10px}
html.f-9x16 .mono .blank{height:250px;margin-top:30px}
`, `    <div>
      <h1 class="display mono"><span class="ln l1">This video is</span><span class="ln l2">Sponsored</span><span class="ln l3">by<i class="blank"></i></span></h1>
    </div>`);

/* ---------- B: checklist ---------- */
const tick = `<svg class="tick" viewBox="0 0 100 100" aria-hidden="true"><path d="M14 54 L38 82 L92 8" fill="none" stroke="currentColor" stroke-width="15" stroke-linecap="square" stroke-linejoin="miter"/></svg>`;
build('proof-b', 'Proof B - Checklist', 't-pink', `
.stage{justify-content:space-between}
.label{font-size:28px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-bottom:22px}
.list{display:flex;flex-direction:column;border-top:6px solid var(--fg)}
.row{display:flex;align-items:center;gap:36px;border-bottom:6px solid var(--fg);padding:20px 0}
.row .box{position:relative;flex:0 0 96px;width:96px;height:96px;border:10px solid var(--fg)}
.row .box .tick{position:absolute;left:-6px;top:-34px;width:118px;height:118px;color:var(--fg);overflow:visible}
.row .t{font-size:92px;line-height:.95}
.row.last{padding:36px 0 0;border-bottom:none;gap:44px;align-items:center}
.row.last .box{flex:0 0 230px;width:230px;height:230px;border:22px solid var(--blue)}
.row.last .t{font-size:196px;line-height:.86;white-space:normal}
html.f-9x16 .row{padding:26px 0}
html.f-9x16 .row.last{padding:44px 0 0}
`, `    <div class="label">Small channel / to do</div>
    <div class="list display">
      <div class="row"><span class="box">${tick}</span><span class="t">First video</span></div>
      <div class="row"><span class="box">${tick}</span><span class="t">First comment</span></div>
      <div class="row"><span class="box">${tick}</span><span class="t">First 1,000 subs</span></div>
      <div class="row last"><span class="box"></span><span class="t">First<br>sponsor</span></div>
    </div>`);

/* ---------- C: film one-sheet ---------- */
build('proof-c', 'Proof C - One-sheet', 't-ink', `
.sky{position:absolute;left:0;right:0;top:0;height:590px;background:#FFD400}
html.f-9x16 .sky{height:800px}
.stage{justify-content:space-between}
.title{position:relative;color:#0E0E0E}
.title .big{font-size:520px;line-height:.78;margin-left:-8px;margin-top:20px;display:block}
.title .tag{font-size:46px;margin-top:26px}
.bill{display:flex;flex-direction:column;margin-top:30px}
.bill .cr{font-family:"Archivo Narrow";font-weight:700;font-size:40px;letter-spacing:.14em;text-transform:uppercase;line-height:1.4;border-top:2px solid rgba(241,239,235,.35);padding:8px 0 4px}
.bill .cr:first-child{border-top:none}
.bill .sp{font-size:118px;margin-top:16px;display:flex;align-items:baseline;gap:.12em;border-top:6px solid var(--fg);padding-top:26px}
.bill .sp .blank{flex:1;height:.46em;--br:.02em}
html.f-9x16 .title .big{margin-top:0}
html.f-9x16 .bill{margin-top:70px}
`, `    <div class="title">
      <span class="display big">Solo</span>
      <div class="tag wit">A one-person channel. A one-person crew.</div>
    </div>
    <div class="bill">
      <div class="cr">Written by you</div>
      <div class="cr">Filmed by you</div>
      <div class="cr">Edited by you</div>
      <div class="sp display"><span>Sponsored by</span><i class="blank"></i></div>
    </div>`);
// the sky block must sit behind the stage; inject right after .poster opens
for (const f of ['proof-c']) {
  const p = path.join(src, f + '.html');
  let h = fs.readFileSync(p, 'utf8');
  h = h.replace('<div class="stage">', '<div class="sky"></div>\n  <div class="stage">');
  fs.writeFileSync(p, h);
}
console.log('built');
