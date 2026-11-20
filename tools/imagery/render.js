// render.js <outDir> [name ...] : renders the scenes in scenes.js to PNG at their exact pixel size.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const scenes = require('./scenes.js');
const [outDir, ...only] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [name, make] of Object.entries(scenes)) {
    if (only.length && !only.includes(name)) continue;
    const sc = make();
    const p = await b.newPage({ viewport: { width: sc.w, height: sc.h }, deviceScaleFactor: 1 });
    await p.setContent(`<body style="margin:0;background:#000">${sc.svg()}</body>`);
    await p.screenshot({ path: path.join(outDir, name + '.png') });
    await p.close(); console.log(name, sc.w + 'x' + sc.h);
  }
  await b.close();
})();
