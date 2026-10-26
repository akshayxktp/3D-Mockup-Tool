#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const OUT = path.join(__dirname, '..', '.shots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'shell',
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
    protocolTimeout: 300_000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
  await page.goto('http://localhost:3000/mockup', { waitUntil: 'networkidle2', timeout: 90_000 });
  await new Promise((r) => setTimeout(r, 3000));
  const info = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    items: [...document.querySelectorAll('.tpl-name')].map((n) => n.textContent),
    groups: [...document.querySelectorAll('.tpl-group-label')].map((n) => n.textContent),
    bodyClasses: document.body.className,
  }));
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: path.join(OUT, 'debug-panel.png') });
  await browser.close();
})();
