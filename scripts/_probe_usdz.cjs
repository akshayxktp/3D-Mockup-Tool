#!/usr/bin/env node
// Temporary: dump app/probe-usdz results to .shots/usdz-probe.json
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
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:3000/probe-usdz', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__probeDone === true', { timeout: 600_000, polling: 500 });
  const data = await page.evaluate(() => window.__probe);
  fs.writeFileSync(path.join(OUT, 'usdz-probe.json'), JSON.stringify(data, null, 2));
  for (const r of data) {
    console.log(`\n=== ${r.file} — ${r.ok ? 'OK' : 'FAIL'} (${r.ms}ms)`);
    if (!r.ok) { console.log('   ', r.error); continue; }
    console.log('    meshes:', r.meshCount, 'total', r.totalSize.join(' x '), 'min', r.min.join(', '));
    console.log('    roots:', r.roots.map((x) => x.name).join(' | '));
    for (const m of r.meshes.slice(0, 40)) {
      console.log(`      - ${m.name} v=${m.verts} uv=${m.uv ? 'y' : 'n'} w=${m.world.join(',')} ${m.color} maps=${m.mismatch || ''} em=${m.emissive}`);
    }
    if (r.meshCount > 40) console.log(`      … ${r.meshCount - 40} more`);
  }
  await browser.close();
})();
