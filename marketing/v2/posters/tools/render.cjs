// Renders every src/*.html (except files starting with "_") to out/<name>_4x5.png and out/<name>_9x16.png
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = path.join(root, 'src'), out = path.join(root, 'out');
const sizes = { '4x5': [1080, 1350], '9x16': [1080, 1920] };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const files = fs.readdirSync(src).filter(f => f.endsWith('.html') && !f.startsWith('_'));
  for (const f of files) {
    const name = f.replace(/\.html$/, '');
    for (const [fmt, [w, h]] of Object.entries(sizes)) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.goto('file://' + path.join(src, f) + '?format=' + fmt);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);
      const o = path.join(out, `${name}_${fmt}.png`);
      await page.screenshot({ path: o, clip: { x: 0, y: 0, width: w, height: h } });
      console.log('wrote', o);
      await page.close();
    }
  }
  await browser.close();
})();
