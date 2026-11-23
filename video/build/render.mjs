import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Frame-accurate capture.
 *
 * The film renders any time t on demand, so the capture is not a screen
 * recording: each frame is the exact state of t = i / 30. That keeps the
 * narration and the picture locked even if a frame takes a second to draw.
 */
const EXE = (() => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe';
    if (fs.existsSync(local)) return local;
    return 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  }
  return process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
})();
const OUT = process.argv[2] || '.frames';
const FPS = 30;
const START = Number(process.argv[3] || 0);
const END = process.argv[4] ? Number(process.argv[4]) : null;

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--disable-lcd-text', '--font-render-hinting=none'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERR', m.text()); });

await page.goto('http://127.0.0.1:8123/video/index.html?render=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await page.waitForFunction(
  () => Array.from(document.querySelectorAll('video')).every(v => v.readyState >= 2),
  { timeout: 60000 },
);
const total = await page.evaluate(() => window.__filmTotal);
const end = END == null ? total : Math.min(END, total);
const first = Math.round(START * FPS);
const last = Math.round(end * FPS);
console.log(`total ${total.toFixed(2)}s · frames ${first} → ${last}`);

const started = Date.now();
for (let i = first; i < last; i++) {
  const t = i / FPS;
  await page.evaluate(t => window.__render(t), t);
  const file = path.join(OUT, `f${String(i).padStart(5, '0')}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
  if (i % 150 === 0) {
    const el = (Date.now() - started) / 1000;
    const rate = (i - first + 1) / Math.max(el, 0.001);
    console.log(`frame ${i} · t=${t.toFixed(2)} · ${rate.toFixed(1)} fps · eta ${((last - i) / rate / 60).toFixed(1)} min`);
  }
}
console.log('done in', ((Date.now() - started) / 60000).toFixed(1), 'min');
await browser.close();
