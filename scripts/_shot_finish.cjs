#!/usr/bin/env node
// Temporary: pick a device + finish and screenshot the stage, so the ported
// Matte finish tables can be compared with Matte's own product renders.
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.shots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.MS_URL || 'http://localhost:3000/mockup';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const device = process.argv[2] || 'iPhone 17';
const finishes = process.argv.slice(3);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
    protocolTimeout: 600_000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90_000 });
  await page.waitForSelector('.tpl-item', { timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.setItem('motion-welcome-seen', '1');
    localStorage.setItem('motion-tour-seen', '1');
    localStorage.setItem('motion-mockup-tour-seen', '1');
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('.tpl-item', { timeout: 60_000 });
  await page.evaluate(() => {
    const skip = document.querySelector('.tour-card .link-btn');
    if (skip instanceof HTMLElement) skip.click();
  });
  await sleep(800);

  const clicked = await page.evaluate((name) => {
    const rows = [...document.querySelectorAll('.tpl-item')];
    const row = rows.find((r) => r.querySelector('.tpl-name')?.textContent?.trim() === name);
    if (!row) return false;
    row.scrollIntoView({ block: 'center' });
    row.click();
    return true;
  }, device);
  if (!clicked) throw new Error('device row not found: ' + device);
  await sleep(5000);

  for (const finish of finishes) {
    const ok = await page.evaluate((label) => {
      const swatch = document.querySelector(`.finish-swatch[aria-label="${label}"]`);
      if (!(swatch instanceof HTMLElement)) return false;
      swatch.click();
      return true;
    }, finish);
    if (!ok) { console.log('MISSING FINISH', finish); continue; }
    await sleep(2500);
    const el = await page.$('.stage-wrap');
    const file = path.join(OUT, `finish-${device.replace(/[^\w]+/g, '-').toLowerCase()}__${finish.replace(/[^\w]+/g, '-').toLowerCase()}.png`);
    if (el) await el.screenshot({ path: file });
    console.log('shot', device, '|', finish, fs.existsSync(file) ? 'ok' : 'FAILED');
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
