import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

import { existsSync } from 'node:fs';
const EXE = (() => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe';
    if (existsSync(local)) return local;
    return 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  }
  return process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
})();
const OUT = process.argv[2] || '.shots';
const times = process.argv.slice(3).map(Number);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: ['--hide-scrollbars', '--force-device-scale-factor=1'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERR', m.text()); });
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto('http://127.0.0.1:8123/video/index.html?render=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);

for (const t of times) {
  await page.evaluate(t => window.__render(t), t);
  await page.waitForTimeout(60);
  const f = path.join(OUT, `t${String(t.toFixed(1)).padStart(6, '0')}.png`);
  await page.screenshot({ path: f });
  console.log('shot', f);
}
await browser.close();
