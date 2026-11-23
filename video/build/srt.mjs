import fs from 'node:fs';

/** Write the caption track as SRT from the same data the player uses. */
const src = fs.readFileSync(new URL('../film-data.js', import.meta.url), 'utf8');
const json = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));

const pad = (n, w = 2) => String(n).padStart(w, '0');
const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(milli, 3)}`;
};

const out = json.captions.map((c, i) => {
  const text = c.text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `${i + 1}\n${stamp(c.t0)} --> ${stamp(Math.min(c.t1, json.total))}\n${text}\n`;
}).join('\n');

fs.writeFileSync(new URL('../captions.srt', import.meta.url), out);
console.log(`captions.srt · ${json.captions.length} cues · ${json.total.toFixed(1)}s`);
