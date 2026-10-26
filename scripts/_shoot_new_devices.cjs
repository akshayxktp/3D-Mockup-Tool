#!/usr/bin/env node
// Temporary: screenshot every "New Devices" entry on the mockup stage.
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.shots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.MS_URL || 'http://localhost:3000/mockup';

const DEVICES = [
  'iPhone 17',
  'iPhone 17 Pro (AR)',
  'iPhone 18 Pro (AR)',
  'iPhone Air (AR)',
  'iPad Pro 13″ (M4, Black)',
  'iPad Pro 13″ (M4, Silver)',
  'MacBook Pro 14″ (M4)',
  'MacBook Pro 14″ (2025)',
  'MacBook Pro 16″ (M4)',
  'iMac 24″',
  'Studio Display (AR)',
  'iPhone Duo (AR)',
  'Apple Watch Series 11',
  'Apple Watch Ultra 3 (AR)',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  // Welcome tour, if it appears.
  await page.evaluate(() => {
    const skip = document.querySelector('.tour-card .link-btn');
    if (skip instanceof HTMLElement) skip.click();
    const close = document.querySelector('.welcome-close, [aria-label="Close"], .tour-close');
    if (close instanceof HTMLElement) close.click();
  });
  await sleep(1200);

  const which = process.argv.slice(2);
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const list = which.length ? DEVICES.filter((d) => which.some((w) => norm(d).includes(norm(w)))) : DEVICES;

  for (const label of list) {
    const clicked = await page.evaluate((name) => {
      const rows = [...document.querySelectorAll('.tpl-item')];
      const row = rows.find((r) => r.querySelector('.tpl-name')?.textContent?.trim() === name);
      if (!row) return false;
      row.scrollIntoView({ block: 'center' });
      row.click();
      return true;
    }, label);
    if (!clicked) { console.log('MISSING ROW:', label); continue; }
    await sleep(4500);
    const el = await page.$('.stage-wrap');
    const file = path.join(OUT, `newdev-${label.replace(/[^\w]+/g, '-').toLowerCase()}.png`);
    if (el) await el.screenshot({ path: file });
    console.log('shot', label, fs.existsSync(file) ? 'ok' : 'FAILED');
  }

  await browser.close();
})();
