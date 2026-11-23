import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Capture the 60 s cut.
 *
 * The cut is a mapping from output time to the long film's time: each shot
 * carries a source time and a duration. Frames are rendered from that mapping,
 * so the edit is exact and repeatable.
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
const OUT = process.argv[2] || '.frames-short';
const FPS = 30;
const START = Number(process.argv[3] || 0);
const END = process.argv[4] ? Number(process.argv[4]) : null;

const raw = fs.readFileSync(new URL('../short-data.js', import.meta.url), 'utf8');
const DATA = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
const shots = DATA.beats.flatMap(b => b.shots.map(s => ({ ...s, beat: b.id })));
const total = DATA.total;
const first = Math.round(START * FPS);
const last = END == null ? Math.round(total * FPS) : Math.round(END * FPS);

function sourceAt(tau) {
  let shot = shots[0];
  for (const s of shots) if (tau >= s.at) shot = s;
  return shot.src + Math.min(Math.max(tau - shot.at, 0), shot.dur);
}

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
await page.waitForTimeout(400);
await page.waitForFunction(
  () => Array.from(document.querySelectorAll('video')).every(v => v.readyState >= 2),
  { timeout: 60000 },
);

console.log(`short ${total.toFixed(2)}s · frames ${first} → ${last} · ${shots.length} shots`);
const started = Date.now();
for (let i = first; i < last; i++) {
  const tau = i / FPS;
  const src = sourceAt(tau);
  await page.evaluate(t => window.__render(t), src);
  await page.screenshot({ path: path.join(OUT, `s${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
  if (i % 150 === 0 || i === first) {
    const el = (Date.now() - started) / 1000;
    console.log(`frame ${i} · cut ${tau.toFixed(2)} → src ${src.toFixed(2)} · ${(i / Math.max(el, 0.001)).toFixed(1)} fps`);
  }
}
console.log('done in', ((Date.now() - started) / 60000).toFixed(1), 'min');
await browser.close();
