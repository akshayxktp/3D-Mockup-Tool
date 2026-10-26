#!/usr/bin/env node
// Temporary: dump the AR display quads.
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.shots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader'],
    protocolTimeout: 600_000,
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:3000/probe-usdz-screen', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__screenDone === true', { timeout: 600_000, polling: 500 });
  const data = await page.evaluate(() => window.__screen);
  fs.writeFileSync(path.join(OUT, 'usdz-screen.json'), JSON.stringify(data, null, 2));
  for (const r of data) {
    console.log(`\n=== ${r.file}`);
    if (r.error) { console.log(r.error); continue; }
    console.log('total', r.total);
    for (const d of r.displays) console.log('  display', d.name, 'geo', d.geoSize, 'aspect', d.geoAspect, 'c', d.center, 'n', d.normal, 'rotXYZdeg', d.rotationDeg);
  }
  await browser.close();
})();
