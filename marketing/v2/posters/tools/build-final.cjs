// Builds posters 01-04 (src/0N-*.html) from src/_template.html. Usage: node marketing/v2/posters/tools/build-final.cjs
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'src');
const tpl = fs.readFileSync(path.join(src, '_template.html'), 'utf8');
function build(name, title, theme, css, content) {
  let h = tpl;
  h = h.replace('<title>Poster template</title>', `<title>${title}</title>`);
  h = h.replace('poster t-cream"><!--THEME_MARK-->', `poster ${theme}">`);
  h = h.replace('/*EXTRA_CSS*/', FOOT + css);
  h = h.replace('<!--CONTENT-->\n', content + '\n');
  h = h.replace('<!--AI-->', '');
  fs.writeFileSync(path.join(src, name + '.html'), h);
}
// Shared per-poster overrides (template and footer markup untouched): Apply as a solid mark, bigger legal line, base bands for 9:16.
const FOOT = `
.stage{position:static;display:flex;flex-direction:column;justify-content:space-between}
.stage > .grow{flex:1;display:flex;flex-direction:column;justify-content:space-between;min-height:0}
.foot .apply span{display:inline-block;background:var(--blue);color:var(--bg);padding:0 16px 3px;line-height:1.3;margin-right:6px}
.foot .r2{font-size:26px;font-weight:700;letter-spacing:.01em}
.support{margin-top:24px}
.base{display:none;position:absolute;left:0;right:0}
html.f-9x16 .base{display:block;top:1572px;bottom:0}
`;

/* 01 NOT INCLUDED: oxblood */
build('01-not-included', 'Sponsor Not Included', 't-oxblood', `
.nl{display:flex;flex-direction:column;gap:6px}
.nl .w{display:block}
.nl .w1{font-size:285px}
.nl .w3{font-size:274px}
.nl .band{display:flex;align-items:center;margin:0 -64px;padding:14px 64px 10px;background:var(--fg);color:var(--bg);font-size:274px}
.nl .band .not{display:block}
.nl .spec{margin-left:auto;max-width:470px;font-family:"Archivo Narrow",sans-serif;font-weight:700;font-size:28px;line-height:1.25;letter-spacing:.01em;text-transform:none;white-space:normal;text-wrap:balance;color:#0E0E0E;border-left:6px solid var(--bg);padding-left:22px}
.nl .blank{display:block;width:100%;height:56px;margin-top:22px;--br:.02em}
html.f-9x16 .nl .band{font-size:320px;padding:20px 64px 14px}
html.f-9x16 .nl .spec{max-width:400px;font-size:30px}
html.f-9x16 .nl .blank{height:70px;margin-top:24px}
html.f-9x16 .nl{gap:10px}
.base{background:repeating-linear-gradient(135deg,var(--fg) 0 44px,var(--bg) 44px 88px)}
html.f-9x16 .base.tp{top:0;bottom:auto;height:110px}
`, `    <div class="base tp"></div><div class="base"></div>
    <h1 class="display nl"><span class="w w1">Sponsor</span><span class="w band"><span class="not">Not</span><span class="spec">Includes: ideas, camera, editing, late nights.</span></span><span class="w w3">Included</span><i class="blank"></i></h1>`);

/* 02 MONUMENT: yellow */
build('02-monument', 'The Monument', 't-yellow', `
.mono{display:flex;flex-direction:column;gap:8px}
.mono .ln{display:block}
.mono .l1{font-size:198px}
.mono .l2{font-size:226px}
.mono .l3{font-size:226px}
.mono .blank{display:block;width:100%;height:250px;margin-top:26px;--br:.02em}
html.f-9x16 .mono{gap:14px}
html.f-9x16 .mono .blank{height:290px;margin-top:30px}
.base{background:#0E0E0E}
.base::before,.base::after{content:"";position:absolute;left:0;right:0;background:#2B44D6}
.base::before{top:56px;height:96px}
.base::after{top:196px;height:44px;opacity:.9}
`, `    <div class="base"></div>
    <h1 class="display mono"><span class="ln l1">This video is</span><span class="ln l2">Sponsored</span><span class="ln l3">by</span><i class="blank"></i></h1>`);

/* 03 ONE-PERSON FILM: ink */
build('03-one-person-film', 'The One-Person Film', 't-ink', `
.sky{position:absolute;left:0;right:0;top:0;height:572px;background:#FFD400}
html.f-9x16 .sky{height:782px}
.base{background:#FFD400}
.base::before,.base::after{content:"";position:absolute;left:0;right:0;height:64px;background:repeating-linear-gradient(to right,#0E0E0E 0 64px,transparent 64px 112px);left:24px}
.base::before{top:90px}
.base::after{top:230px}
.title{position:relative;color:#0E0E0E}
.title .big{font-size:520px;line-height:.78;margin-left:-8px;margin-top:6px;display:block}
.title .tag{font-size:46px;margin-top:26px}
html.f-9x16 .title .big{margin-top:0}
.bill{display:flex;flex-direction:column;align-items:center;margin-top:22px}
.bill .cr{font-size:44px;letter-spacing:.14em;line-height:1.02;text-align:center;padding-left:.14em}
.bill .rule{width:100%;height:2px;background:rgba(241,239,235,.4);margin:8px 0 6px}
.bill .sp{width:100%;font-size:112px;display:flex;align-items:baseline;gap:.12em;border-top:6px solid var(--fg);padding-top:22px;margin-top:18px}
.bill .sp .blank{flex:1;height:.46em;--br:.02em}
html.f-9x16 .bill{margin-top:24px}
html.f-9x16 .bill .cr{font-size:54px;line-height:1.12}
html.f-9x16 .bill .rule{margin:10px 0 8px}
`, `    <div class="sky"></div><div class="base"></div>
    <div class="title">
      <span class="display big">Solo</span>
      <div class="tag wit">A one-person channel. A one-person crew.</div>
    </div>
    <div class="bill display">
      <div class="cr">Written by you</div><div class="rule"></div>
      <div class="cr">Filmed by you</div><div class="rule"></div>
      <div class="cr">Edited by you</div><div class="rule"></div>
      <div class="cr">Posted by you</div>
      <div class="sp"><span>Sponsored by</span><i class="blank"></i></div>
    </div>`);

/* 04 CHECKLIST: pink */
const tick = `<svg class="tick" viewBox="0 0 100 100" aria-hidden="true"><path d="M14 54 L38 82 L92 8" fill="none" stroke="currentColor" stroke-width="15" stroke-linecap="square" stroke-linejoin="miter"/></svg>`;
build('04-checklist', 'The Checklist', 't-pink', `
.label{font-size:28px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-bottom:22px}
.list{display:flex;flex-direction:column;border-top:6px solid var(--fg)}
.row{display:flex;align-items:center;gap:36px;border-bottom:6px solid var(--fg);padding:20px 0}
.row .box{position:relative;flex:0 0 96px;width:96px;height:96px;border:10px solid var(--fg)}
.row .box .tick{position:absolute;left:-6px;top:-34px;width:118px;height:118px;color:var(--fg);overflow:visible}
.row .t{font-size:92px;line-height:.95}
.row.last{padding:36px 0 0;border-bottom:none;gap:44px}
.row.last .box{flex:0 0 230px;width:230px;height:230px;border:22px solid var(--blue)}
.row.last .t{font-size:196px;line-height:.86;white-space:normal}
html.f-9x16 .row{padding:32px 0}
html.f-9x16 .row.last{padding:56px 0 0}
.base{background:repeating-linear-gradient(to bottom,transparent 0 92px,rgba(14,14,14,.38) 92px 96px)}
`, `    <div class="base"></div>
    <div class="label">Small channel / to do</div>
    <div class="list display">
      <div class="row"><span class="box">${tick}</span><span class="t">First video</span></div>
      <div class="row"><span class="box">${tick}</span><span class="t">First comment</span></div>
      <div class="row"><span class="box">${tick}</span><span class="t">First 1,000 subs</span></div>
      <div class="row last"><span class="box"></span><span class="t">First<br>sponsor</span></div>
    </div>`);
console.log('built');
