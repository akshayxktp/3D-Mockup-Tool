#!/usr/bin/env node
// Temporary: screenshot the USDZ contact sheet from app/probe-usdz-sheet.
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
  await page.setViewport({ width: 900, height: 900 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
  await page.goto('http://localhost:3000/probe-usdz-sheet', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__sheetDone === true', { timeout: 600_000, polling: 500 });
  const dataUrl = await page.evaluate(() => window.__sheet);
  const base64 = dataUrl.split(',')[1];
  const out = path.join(OUT, process.argv[2] || 'usdz-sheet.png');
  fs.writeFileSync(out, Buffer.from(base64, 'base64'));
  console.log('wrote', out);
  await browser.close();
})();
