import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const EXE = process.env.CHROME_PATH ||
  (existsSync(process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe')
    ? process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe' : '');

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERR', m.text()); });
await page.goto('https://flagopen.github.io/HumanCOIN-DataManager/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(9000);   // let the visualisation settle / animate
await page.screenshot({ path: 'C:/Projects/HumanCOIN/display/video/assets/datamanager.jpg', type: 'jpeg', quality: 88 });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'C:/Projects/HumanCOIN/display/video/assets/datamanager-2.jpg', type: 'jpeg', quality: 88 });
console.log('captured');
await browser.close();
