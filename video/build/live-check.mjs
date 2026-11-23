import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const EXE = process.env.CHROME_PATH ||
  (existsSync(process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe')
    ? process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe' : '');

const browser = await chromium.launch({ executablePath: EXE, args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:8123/video/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.evaluate(() => window.__seek(130));
await page.waitForTimeout(2500);
const state = await page.evaluate(() => {
  const vids = [...document.querySelectorAll('video')];
  return {
    videos: vids.length,
    playing: vids.filter(v => !v.paused).length,
    ready: vids.filter(v => v.readyState >= 2).length,
    srcOk: vids.every(v => v.src.includes('assets/l3/vid/')),
  };
});
console.log('live player @130s:', JSON.stringify(state));
await page.evaluate(() => window.__seek(40));
await page.waitForTimeout(800);
const state2 = await page.evaluate(() => document.querySelector('.pw-moment')?.textContent);
console.log('pathway moment label:', state2);
await browser.close();
console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
