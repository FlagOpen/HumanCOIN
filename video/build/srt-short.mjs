import fs from 'node:fs';

const src = fs.readFileSync(new URL('../short-data.js', import.meta.url), 'utf8');
const json = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const pad = (n, w = 2) => String(n).padStart(w, '0');
const stamp = (s) => {
  const ms = Math.round(s * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms % 3600000 / 60000))}:${pad(Math.floor(ms % 60000 / 1000))},${pad(ms % 1000, 3)}`;
};
const out = json.captions.map((c, i) =>
  `${i + 1}\n${stamp(c.t0)} --> ${stamp(Math.min(c.t1, json.total))}\n${c.text}\n`).join('\n');
fs.writeFileSync(new URL('../short.srt', import.meta.url), out);
console.log('short.srt', json.captions.length, 'cues', json.total.toFixed(1) + 's');
