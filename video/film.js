/* ============================================================
   HumanCOIN — film engine
   The whole film is a pure function of t: every scene sets its own
   styles from the timeline, so any frame can be rendered on demand.
   That is what makes the frame-accurate capture possible.
   ============================================================ */
(() => {
  'use strict';

  const FILM = window.FILM || { beats: [], cues: {}, captions: [], total: 240, audio: 'audio/narration.m4a' };
  const DATA = window.L3 || null;
  const stage = document.getElementById('stage');
  const chrome = document.getElementById('chrome');
  const chapEl = document.getElementById('chap');
  const progress = document.querySelector('#progress i');
  const captionBox = document.getElementById('captions');
  const W = 1920, H = 1080;
  const RENDER = new URLSearchParams(location.search).has('render');

  /* ---------------- utilities ---------------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (t, a, b) => (b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
  const out = p => 1 - Math.pow(1 - p, 3);
  const inOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const cue = name => (FILM.cues[name] != null ? FILM.cues[name] : 0);
  const beat = id => FILM.beats.find(b => b.id === id);
  const fmtInt = n => Math.round(n).toLocaleString('en-US');
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const set = (node, styles) => { for (const k in styles) node.style[k] = styles[k]; };
  const vis = (node, v) => { node.style.opacity = v; };
  const svgTick = (p, a, b) => out(seg(p, a, b));

  /* flowing dash animation on an svg line: pure function of t */
  function flow(el2, t, speed = 110, dash = 13, gap = 9) {
    const len = dash + gap;
    el2.style.strokeDasharray = `${dash} ${gap}`;
    el2.style.strokeDashoffset = String(-((t * speed) % len));
  }

  const SCENES = [];
  function addScene(id, elm, render, opts = {}) {
    elm.classList.add('scene');
    elm.id = 's-' + id;
    stage.appendChild(elm);
    const b = beat(id);
    const t0 = opts.t0 != null ? opts.t0 : (b ? b.scene_start : 0);
    const t1 = opts.t1 != null ? opts.t1 : (b ? b.scene_end : FILM.total);
    const s = { id, el: elm, render, t0, t1, ...opts };
    SCENES.push(s);
    return s;
  }

  /* ---------------- chrome ---------------- */
  const CHAPTERS = {
    intro: ['', ''],
    gap: ['01', 'THE GAP'],
    pathway: ['02', 'THE INTENT PATHWAY'],
    traces: ['03', 'TRACES'],
    dataset: ['03', 'THE DATASET'],
    tiers: ['04', 'INTENT PROXIES'],
    episode: ['05', 'ONE EPISODE'],
    dist: ['06', 'DISTRIBUTIONS'],
    format: ['07', 'THE FORMAT'],
    community: ['08', 'COMMUNITY'],
    outro: ['', ''],
  };
  let chromeScene = null;
  function updateChrome(sceneId, t) {
    if (sceneId === 'intro' || sceneId === 'outro') {
      chrome.classList.remove('on');
      return;
    }
    chrome.classList.add('on');
    chrome.classList.toggle('night', sceneId === 'episode');
    let key = sceneId;
    if (sceneId === 'pathway' && beat('traces') && t >= beat('traces').scene_start) key = 'traces';
    if (chromeScene !== key) {
      chromeScene = key;
      const [num, name] = CHAPTERS[key] || ['', ''];
      chapEl.innerHTML = num ? `<b>${num}</b> &nbsp; ${name}` : name;
    }
    progress.style.transform = `scaleX(${clamp(t / FILM.total)})`;
  }

  /* ---------------- video helpers (live player only) ---------------- */
  function video(src, cls) {
    const v = document.createElement('video');
    v.src = src;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.className = cls || '';
    v.addEventListener('loadeddata', () => { v.dataset.ready = '1'; });
    return v;
  }

  const seeks = [];
  function seekAll(videos, time) {
    if (!RENDER) {
      for (const v of videos) {
        if (!v.dataset.ready) continue;
        const d = v.duration || 17.4;
        const target = ((time % d) + d) % d;
        if (v.paused) {
          try { v.currentTime = target; } catch (e) { /* not seekable yet */ }
          v.play().catch(() => {});
        } else if (Math.abs(v.currentTime - target) > 0.4) {
          v.currentTime = target;
        }
      }
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  /* ---------------- canvas helpers ---------------- */
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    return { c, ctx };
  }

  /* ============================================================
     01 · INTRO
     ============================================================ */
  function buildIntro() {
    const root = el('div');
    const mosaic = el('div', 'mosaic');
    const mos = (window.MOSAIC || []).slice();
    const posters = (window.THUMBS || []).slice();
    const thumbs = [];
    for (let i = 0; i < 48; i++) {
      const src2 = i % 2 ? mos[i % Math.max(1, mos.length)] : posters[i % Math.max(1, posters.length)];
      if (src2) thumbs.push(src2);
    }
    const order = [];
    if (thumbs.length && !thumbs[0].tier) {
      order.push(...thumbs);
    } else {
      for (let i = 0; i < 8; i++) {
        for (const tier of ['L1', 'L2', 'L3']) {
          const pick = thumbs.filter(x => x.tier === tier)[i];
          if (pick) order.push(pick);
        }
      }
    }
    while (order.length < 48 && thumbs.length) order.push(thumbs[order.length % thumbs.length]);
    order.length = 48;
    const cols = 8, rows = 6, tw = 240, th = 180, gap = 4;
    const gw = cols * tw + (cols - 1) * gap;
    const gh = rows * th + (rows - 1) * gap;
    const ox = (W - gw) / 2, oy = (H - gh) / 2;
    const tiles = [];
    order.forEach((item, i) => {
      const cx = i % cols, cy = Math.floor(i / cols);
      const tile = el('div', 'tile');
      tile.style.width = tw + 'px';
      tile.style.height = th + 'px';
      const img = new Image();
      img.src = item.src;
      img.alt = '';
      tile.appendChild(img);
      tile.style.left = ox + cx * (tw + gap) + 'px';
      tile.style.top = oy + cy * (th + gap) + 'px';
      const dx = (cx - (cols - 1) / 2) / (cols / 2), dy = (cy - (rows - 1) / 2) / (rows / 2);
      tiles.push({ tile, d: Math.sqrt(dx * dx + dy * dy) / 1.5 });
      mosaic.appendChild(tile);
    });
    const veil = el('div', 'veil');
    const band = el('div', 'band');
    band.innerHTML = `
      <div class="kicker">BAAI · AHADATA GROUP · NOVEMBER 2026</div>
      <h1>HumanCOIN</h1>
      <div class="sub">A 12,500-hour dataset for human intent<br>in egocentric manipulation</div>
      <div class="meta">12,500 h &nbsp;·&nbsp; 38 scene classes &nbsp;·&nbsp; 3 intent tiers &nbsp;·&nbsp; 1 clock</div>
      <div class="authors">Shihan Wu &nbsp;·&nbsp; You Liu &nbsp;·&nbsp; Minghui Qin &nbsp;·&nbsp; Longhan Jiao &nbsp;·&nbsp; Jinbang Guo &nbsp;·&nbsp; Shaoxuan Xie &nbsp;·&nbsp; Zhongyuan Wang &nbsp;·&nbsp; Guocai Yao &nbsp;·&nbsp; et al.</div>`;
    const wipe = el('div');
    set(wipe, { position: 'absolute', inset: '0', background: '#fff', transform: 'scaleY(0)', transformOrigin: '50% 100%' });
    root.append(mosaic, veil, band, wipe);

    const b = beat('intro');
    const start = b ? b.start : 0.8;

    function render(t) {
      const local = t - start;
      tiles.forEach(({ tile, d }, i) => {
        const p = out(seg(t, 0.05 + d * 0.45 + (i % 6) * 0.016, 0.95 + d * 0.45 + (i % 6) * 0.016));
        tile.style.opacity = p;
        tile.style.transform = `scale(${1.045 - 0.045 * p}) translateY(${(1 - p) * 14}px)`;
      });
      const drift = inOut(seg(t, start - 0.4, (b ? b.scene_end : start + 12)));
      mosaic.style.transform = `scale(${1 + drift * 0.035})`;
      const bp = inOut(seg(t, start + 0.15, start + 1.5));
      band.style.clipPath = `inset(${50 - 50 * bp}% 0 ${50 - 50 * bp}% 0)`;
      veil.style.background = `rgba(255,255,255,${0.42 * bp})`;
      const btext = out(seg(t, start + 0.5, start + 1.6));
      band.querySelector('h1').style.opacity = btext;
      band.querySelector('h1').style.transform = `translateY(${(1 - btext) * 18}px)`;
      band.querySelector('.sub').style.opacity = out(seg(t, start + 0.8, start + 1.9));
      band.querySelector('.meta').style.opacity = out(seg(t, start + 1.1, start + 2.2));
      band.querySelector('.authors').style.opacity = out(seg(t, start + 1.4, start + 2.5));
      const end = b ? b.scene_end : start + 12;
      const wp = inOut(seg(t, end - 0.55, end + 0.1));
      wipe.style.transform = `scaleY(${wp})`;
    }
    return { el: root, render };
  }

  /* ============================================================
     01 · THE GAP — after the page's Fig. 1: three routes, the latent z
     ============================================================ */
  function buildGap() {
    const root = el('div');
    const wire = (x0, x1, y, fn, cls) => `
      <svg class="fg-line" style="left:${x0}px;top:${y - 4}px;width:${x1 - x0}px" viewBox="0 0 ${x1 - x0} 8" preserveAspectRatio="none">
        <path class="gw-base" d="M0 4 H ${x1 - x0}"/>
        <path class="gw-flow" d="M0 4 H ${x1 - x0}"/>
      </svg>
      <svg class="fg-arrow" style="left:${x1 - 15}px;top:${y - 9}px" viewBox="0 0 18 18"><path class="gw-head" d="M1 1 L 16 9 L 1 17"/></svg>
      <span class="fg-fn ${cls || ''}" style="left:${(x0 + x1) / 2}px;top:${y - 42}px">${fn}</span>`;
    root.innerHTML = `
      <div class="head">
        <div class="kicker">01 <span class="dot">·</span> THE GAP</div>
        <h2>Three ways from <em>o</em> to <em>a</em>.</h2>
      </div>

      <div class="fg">
        <!-- route 1: direct policy -->
        <div class="fg-row" data-p="policy">
          <div class="fg-route" style="top:2px"><b>Direct policy</b><span>one step</span></div>
          <div class="fg-node" style="left:300px;top:0">o</div>
          <div class="fg-cap" style="left:348px;top:82px">OBSERVATION</div>
          ${wire(396, 1420, 32, 'π(a&nbsp;|&nbsp;o)')}
          <div class="fg-node" style="left:1420px;top:0">a</div>
          <div class="fg-cap" style="left:1468px;top:82px">ACTION</div>
        </div>

        <!-- route 2: world model -->
        <div class="fg-row" data-p="world">
          <div class="fg-route" style="top:2px"><b>World model</b><span>predict, then act</span></div>
          <div class="fg-node" style="left:300px;top:0">o</div>
          <div class="fg-cap" style="left:348px;top:82px">OBSERVATION</div>
          ${wire(396, 850, 32, 'p(ô′&nbsp;|&nbsp;o)')}
          <div class="fg-node dash" style="left:850px;top:0">ô′</div>
          <div class="fg-cap" style="left:898px;top:82px">PREDICTED</div>
          ${wire(946, 1420, 32, 'p(a&nbsp;|&nbsp;ô′)')}
          <div class="fg-node" style="left:1420px;top:0">a</div>
          <div class="fg-cap" style="left:1468px;top:82px">ACTION</div>
        </div>

        <!-- route 3: latent conditioned -->
        <div class="fg-row" data-p="intent">
          <div class="fg-route" style="top:2px"><b>Latent conditioned</b><span>conditioned on z</span></div>
          <div class="fg-node" style="left:300px;top:0">o</div>
          <div class="fg-cap" style="left:348px;top:82px">OBSERVATION</div>
          ${wire(396, 850, 32, 'p(z&nbsp;|&nbsp;o)', 'blue')}
          <div class="fg-node z" style="left:850px;top:0">z</div>
          <div class="fg-cap" style="left:898px;top:82px">INTENT</div>
          ${wire(946, 1420, 32, 'p(a&nbsp;|&nbsp;o, z)', 'blue')}
          <div class="fg-node" style="left:1420px;top:0">a</div>
          <div class="fg-cap" style="left:1468px;top:82px">ACTION</div>
          <div class="fg-znote">
            <div class="fg-leader"></div>
            <div class="fg-ztext">z · the latent intent that makes the mapping well-defined.</div>
          </div>
        </div>
      </div>

      <div class="ga-branch">
        <div class="ga-blabel">one <b>o</b> &nbsp;·&nbsp; many <b>a</b>'s</div>
        <div class="ga-chips">
          <span data-b="lift"><i></i>lift</span>
          <span data-b="regrip"><i></i>re-grip</span>
          <span data-b="pause"><i></i>pause</span>
          <span data-b="abandon"><i></i>abandon</span>
          <span class="ga-q">?</span>
        </div>
        <div class="ga-qnote">the frame does not say which</div>
      </div>

      <div class="ga-bottom">
        <div class="ga-formula">
          <div class="kicker">the latent variable</div>
          <div class="eq">p(a | o) = ∫ p(a | o, <b>z</b>) &nbsp;p(<b>z</b> | o) &nbsp;dz</div>
          <div class="note">z is unobservable — no camera sees it directly</div>
        </div>
        <div class="ga-answer">
          <div class="aa-row"><span class="aa-k">the proxies</span><span class="aa-eq">m<sub>j</sub> = f<sub>j</sub>(z<sub>j</sub>, o) + ε<sub>j</sub></span></div>
          <div class="aa-box">
            <b>HumanCOIN</b>
            <span>m = ( m<sub>gaze</sub>, &nbsp;m<sub>emg</sub>, &nbsp;m<sub>eeg</sub> )</span>
          </div>
          <div class="aa-note">gaze · EMG · EEG — read from the operator, not from the frame</div>
        </div>
      </div>`;

    const head = root.querySelector('.head');
    const rows = [...root.querySelectorAll('.fg-row')];
    const chips = [...root.querySelectorAll('.ga-chips span')];
    const qnote = root.querySelector('.ga-qnote');
    const formula = root.querySelector('.ga-formula');
    const answer = root.querySelector('.ga-answer');
    const znote = root.querySelector('.fg-znote');
    const wires = [...root.querySelectorAll('.gw-flow')];
    const b = beat('gap');
    const s = b ? b.start : 14;

    const branchCue = { lift: cue('branch_lift'), regrip: cue('branch_regrip'), pause: cue('branch_pause'), abandon: cue('branch_abandon') };

    function render(t) {
      const hp = out(seg(t, s - 0.35, s + 0.5));
      head.style.opacity = hp;
      head.style.transform = `translateY(${(1 - hp) * 16}px)`;

      const p1 = out(seg(t, cue('pair') - 0.1, cue('pair') + 0.55));
      rows[0].style.opacity = p1;
      rows[0].style.transform = `translateY(${(1 - p1) * 12}px)`;
      const p2 = out(seg(t, cue('policy') - 0.1, cue('policy') + 0.55));
      rows[1].style.opacity = 0.2 + 0.8 * p2;
      rows[1].style.transform = `translateY(${(1 - p2) * 12}px)`;
      const p3 = out(seg(t, cue('z') - 0.3, cue('z') + 0.55));
      rows[2].style.opacity = 0.15 + 0.85 * p3;
      rows[2].style.transform = `translateY(${(1 - p3) * 12}px)`;
      rows[2].classList.toggle('on', p3 > 0.5);
      znote.style.opacity = out(seg(t, cue('z_label') - 0.2, cue('z_label') + 0.7));

      chips.forEach(ch => {
        const key = ch.dataset.b;
        const p = out(seg(t, branchCue[key] - 0.15, branchCue[key] + 0.35));
        ch.style.opacity = p;
        ch.style.transform = `translateY(${(1 - p) * 8}px)`;
      });
      const qp = out(seg(t, cue('branch_question') - 0.15, cue('branch_question') + 0.4));
      root.querySelector('.ga-q').style.opacity = qp;
      root.querySelector('.ga-q').style.transform = `scale(${0.6 + 0.4 * qp})`;
      qnote.style.opacity = qp;

      const pp = out(seg(t, cue('z_label') - 0.2, cue('z_label') + 0.7));
      answer.style.opacity = pp;
      answer.style.transform = `translateY(${(1 - pp) * 12}px)`;

      const fp = out(seg(t, cue('formula') - 0.2, cue('formula') + 0.7));
      formula.style.opacity = fp;
      formula.style.transform = `translateY(${(1 - fp) * 12}px)`;

      wires.forEach(w => flow(w, t, 95));
    }
    return { el: root, render };
  }

  /* ============================================================
     02 · THE INTENT PATHWAY — square flowchart, the world band,
     and the fan-out to three signal lanes (16ch EEG · 2×8ch EMG · gaze)
     ============================================================ */
  const HOT = '#a63d40';

  /* schematic multi-channel waveforms for the signal lanes */
  function laneWave(kind, w, h, t) {
    const pts = [];
    const n = 200;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = u * w;
      let y = h / 2;
      if (kind === 'eeg') {
        y = h / 2 - 30 * Math.exp(-Math.pow((u - 0.62) / 0.2, 2)) + 7 * Math.sin(u * 46 + t * 0.0) + 2.5 * Math.sin(u * 90 + 1);
      } else if (kind === 'emg') {
        const burst = Math.exp(-Math.pow((u - 0.5) / 0.11, 2));
        y = h / 2 - burst * 30 * (0.5 + 0.5 * Math.sin(u * 210 + 2)) + 1.5 * Math.sin(u * 70);
      } else {
        y = h / 2 + (u < 0.42 ? 18 : u < 0.7 ? -6 : -14) + 2.5 * Math.sin(u * 34) + (u < 0.42 ? 0 : 0);
      }
      pts.push([x, y]);
    }
    return pts;
  }

  function buildPathway() {
    const root = el('div');
    /* the cup case, five real photographs: observe / think / gaze / force / act.
       model-* are the mannequin edits of the same frames; real-* are the originals. */
    const PHASES = ['observe', 'think', 'gaze', 'force', 'act'];
    root.innerHTML = `
      <div class="head">
        <div class="kicker">02 <span class="dot">·</span> THE INTENT PATHWAY</div>
        <h2>I reach for a cup. The intent runs a loop.</h2>
      </div>

      <div class="pw">
        <div class="pw-photo">
          ${PHASES.map((p, i) => `<img src="assets/cup/model-${p}.jpg" class="${i === 0 ? 'on' : ''}" data-p="${p}"
               onerror="this.onerror=null;this.src='assets/cup/real-${p}.jpg'">`).join('')}
          <div class="pw-moment" id="pwmoment">looking</div>
          <div class="pw-tag">illustrative · mannequin, no devices · one cup</div>
        </div>

        <svg class="pw-svg" viewBox="0 0 1288 480">
          <!-- a square circuit: the world on top, the loop o → intent → a
               along the bottom, connectors up the two sides -->
          <text class="pw-pathname" x="644" y="16" text-anchor="middle">the human intent pathway</text>

          <rect class="pw-world" x="320" y="30" width="640" height="88" rx="12"/>
          <text class="pw-wk" x="344" y="64">the world</text>
          <text class="pw-ws" x="344" y="92">the cup has moved</text>
          <text class="pw-ws2" x="936" y="92" text-anchor="end">one loop</text>

          <rect class="pw-box pw-bo" x="150" y="340" width="180" height="104" rx="12"/>
          <text class="pw-bk" x="240" y="384" text-anchor="middle">o · see</text>
          <text class="pw-bs" x="240" y="410" text-anchor="middle">the cup on the table</text>

          <rect class="pw-box pw-ba" x="950" y="340" width="180" height="104" rx="12"/>
          <text class="pw-bk" x="1040" y="384" text-anchor="middle">a · act</text>
          <text class="pw-bs" x="1040" y="410" text-anchor="middle">the hand closes</text>

          <rect class="pw-box pw-bi" x="500" y="330" width="280" height="124" rx="12"/>
          <text class="pw-bk" x="640" y="372" text-anchor="middle">intent</text>
          <text class="pw-bs" x="640" y="396" text-anchor="middle">from the human</text>
          <g class="pw-bars" transform="translate(602,404)">
            <rect x="0" y="12" width="14" height="30" fill="#0f6f68"/>
            <rect x="26" y="8" width="14" height="34" fill="#8a6136"/>
            <rect x="52" y="4" width="14" height="38" fill="#6a4c9c"/>
            <text x="7" y="54" text-anchor="middle" class="pw-bar-lab">gaze</text>
            <text x="33" y="54" text-anchor="middle" class="pw-bar-lab">emg</text>
            <text x="59" y="54" text-anchor="middle" class="pw-bar-lab">eeg</text>
          </g>

          <!-- the loop: o → intent → a on the bottom, a ↑ world ↓ o on the sides -->
          <path class="pw-flow" id="wf1" d="M330 392 H 500"/>
          <path class="pw-head" d="M490 386 l 10 6 l -10 6"/>
          <path class="pw-flow" id="wf2" d="M780 392 H 950"/>
          <path class="pw-head" d="M940 386 l 10 6 l -10 6"/>
          <path class="pw-flow" id="wf3" d="M1040 340 C 1040 200, 1010 118, 964 118"/>
          <path class="pw-head" d="M974 112 l -10 6 l 10 6"/>
          <path class="pw-flow" id="wf4" d="M316 118 C 270 118, 240 170, 240 340"/>
          <path class="pw-head" d="M234 330 l 6 10 l 6 -10"/>

          <!-- the loop pulse -->
          <circle class="pw-pulse" id="pwpulse" r="6"/>
        </svg>

        <svg class="pw-leads" viewBox="0 0 1920 1080" preserveAspectRatio="none">
          <!-- fan-out from intent, straight down to the three signal lanes -->
          <path class="pw-lead" id="lead-eeg" d="M1090 736 C 900 758, 560 770, 366 782"/>
          <path class="pw-lead" id="lead-emg" d="M1140 736 C 1120 758, 1060 770, 964 782"/>
          <path class="pw-lead" id="lead-gaze" d="M1190 736 C 1360 758, 1500 770, 1554 782"/>
        </svg>
      </div>

      <div class="pw-lanes">
        <div class="pw-lane" data-s="eeg">
          <div class="k">EEG · CORTEX</div>
          <div class="n">16 channels</div>
          <div class="v">preparation precedes movement</div>
          <canvas></canvas>
        </div>
        <div class="pw-lane" data-s="emg">
          <div class="k">EMG · MUSCLE</div>
          <div class="n">2 × 8 channels · left &amp; right</div>
          <div class="v">load builds before contact</div>
          <canvas></canvas>
        </div>
        <div class="pw-lane" data-s="gaze">
          <div class="k">GAZE · EYES</div>
          <div class="n">x / y</div>
          <div class="v">eyes arrive before the hand</div>
          <canvas></canvas>
        </div>
      </div>

      <div class="pw-one">three stations &nbsp;·&nbsp; three signals &nbsp;·&nbsp; <b>one intent</b></div>`;

    const head = root.querySelector('.head');
    const imgs = [...root.querySelectorAll('.pw-photo img')];
    const moment = root.querySelector('#pwmoment');
    const boxO = root.querySelector('.pw-bo');
    const boxI = root.querySelector('.pw-bi');
    const boxA = root.querySelector('.pw-ba');
    const flows = { f1: root.querySelector('#wf1'), f2: root.querySelector('#wf2'), f3: root.querySelector('#wf3'), f4: root.querySelector('#wf4') };
    const pulse = root.querySelector('#pwpulse');
    const leads = { eeg: root.querySelector('#lead-eeg'), emg: root.querySelector('#lead-emg'), gaze: root.querySelector('#lead-gaze') };
    const pathname = root.querySelector('.pw-pathname');
    const lanes = [...root.querySelectorAll('.pw-lane')];
    const one = root.querySelector('.pw-one');

    const b = beat('pathway');
    const s = b ? b.start : 36;

    // lane canvases: a white grid with axes, then the schematic channel lines
    // (drawn at the lane's display size so the axis labels stay readable)
    const LANE_W = 574, LANE_H = 112;
    lanes.forEach(box => {
      const key = box.dataset.s;
      const cv = box.querySelector('canvas');
      cv.width = LANE_W * 2; cv.height = LANE_H * 2;
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(2, 2);
      const X0 = 24, X1 = LANE_W - 10, Y0 = 8, Y1 = LANE_H - 22;
      // ---- white grid
      ctx.strokeStyle = '#e8eff4';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const x = X0 + (X1 - X0) * i / 10;
        ctx.beginPath(); ctx.moveTo(x, Y0); ctx.lineTo(x, Y1); ctx.stroke();
      }
      for (let g = Y0; g <= Y1; g += 18) {
        ctx.beginPath(); ctx.moveTo(X0, g); ctx.lineTo(X1, g); ctx.stroke();
      }
      // ---- axes
      ctx.strokeStyle = '#b6c8d6';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X0, Y0 - 2); ctx.lineTo(X0, Y1); ctx.lineTo(X1, Y1); ctx.stroke();
      ctx.fillStyle = '#5b6c79';
      ctx.font = '9px Mono, monospace';
      ctx.fillText('a.u.', 2, Y0 + 6);
      for (let i = 0; i <= 10; i += 2) {
        const x = X0 + (X1 - X0) * i / 10;
        ctx.beginPath(); ctx.moveTo(x, Y1); ctx.lineTo(x, Y1 + 4); ctx.stroke();
        ctx.fillText(`${-10 + i}`, x - 7, Y1 + 14);
      }
      ctx.fillText('s', X1 - 2, Y1 + 14);

      // ---- the channel lines
      ctx.lineWidth = 1.2;
      if (key === 'eeg') {
        for (let c = 0; c < 16; c++) {
          ctx.strokeStyle = c === 8 ? '#6a4c9c' : 'rgba(106,76,156,0.55)';
          const base = Y0 + 6 + (c / 15) * (Y1 - Y0 - 12);
          ctx.beginPath();
          for (let i = 0; i < 220; i++) {
            const u = i / 219;
            const y = base - 7.5 * Math.exp(-Math.pow((u - 0.62) / 0.2, 2)) + 1.6 * Math.sin(u * 46 + c * 1.7) + 0.7 * Math.sin(u * 93 + c);
            i ? ctx.lineTo(X0 + u * (X1 - X0), y) : ctx.moveTo(X0, y);
          }
          ctx.stroke();
        }
      } else if (key === 'emg') {
        for (let g = 0; g < 2; g++) {
          for (let c = 0; c < 8; c++) {
            ctx.strokeStyle = g === 0 ? 'rgba(138,97,54,0.8)' : 'rgba(199,140,74,0.85)';
            const cx = g === 0 ? 0.3 : 0.7;
            const base = Y0 + 8 + (c / 7) * (Y1 - Y0 - 18) + (g === 0 ? -8 : 10);
            ctx.beginPath();
            for (let i = 0; i < 220; i++) {
              const u = i / 219;
              const burst = Math.exp(-Math.pow((u - cx) / 0.08, 2));
              const y = base - burst * 6.5 * (0.5 + 0.5 * Math.sin(u * 190 + c * 2.4)) + 0.6 * Math.sin(u * 60 + c);
              i ? ctx.lineTo(X0 + u * (X1 - X0), y) : ctx.moveTo(X0, y);
            }
            ctx.stroke();
          }
        }
      } else {
        ctx.strokeStyle = '#0f6f68';
        ctx.lineWidth = 1.8;
        for (let c = 0; c < 2; c++) {
          ctx.beginPath();
          const base = Y0 + 24 + c * (Y1 - Y0 - 44);
          for (let i = 0; i < 220; i++) {
            const u = i / 219;
            const y = base + (u < 0.4 ? 9 : u < 0.68 ? -4 : -8) + 1.6 * Math.sin(u * 38 + c * 2);
            i ? ctx.lineTo(X0 + u * (X1 - X0), y) : ctx.moveTo(X0, y);
          }
          ctx.stroke();
        }
      }
    });

    const sCue = { gaze: cue('gaze'), eeg: cue('eeg'), emg: cue('emg') };
    Object.values(leads).forEach(l => { l.style.strokeDasharray = '7 7'; });

    let lastPhoto = '';
    function setPhoto(name) {
      if (lastPhoto === name) return;
      lastPhoto = name;
      imgs.forEach(im => im.classList.toggle('on', im.dataset.p === name));
    }

    function render(t) {
      const hp = out(seg(t, s - 0.35, s + 0.5));
      head.style.opacity = hp;
      head.style.transform = `translateY(${(1 - hp) * 16}px)`;

      const pp = out(seg(t, s - 0.15, s + 0.7));
      root.querySelector('.pw').style.opacity = pp;
      root.querySelector('.pw').style.transform = `translateY(${(1 - pp) * 18}px)`;

      // the photograph follows the moment being described — slow cuts
      if (t < cue('station_act')) { setPhoto('observe'); }
      else if (t < cue('eeg')) { setPhoto('act'); }
      else if (t < cue('emg')) { setPhoto('force'); }
      else if (t < cue('gaze')) { setPhoto('gaze'); }
      else { setPhoto('think'); }

      if (t < cue('station_decide')) moment.textContent = 'looking';
      else if (t < cue('station_look')) moment.textContent = 'deciding';
      else if (t < cue('station_act')) moment.textContent = 'a glance';
      else if (t < cue('eeg')) moment.textContent = 'acting';
      else if (t < cue('emg')) moment.textContent = 'muscle loads';
      else if (t < cue('gaze')) moment.textContent = 'eyes arrive';
      else moment.textContent = 'the intent';

      // red-step highlights through the loop
      const dec = out(seg(t, cue('station_decide') - 0.1, cue('station_decide') + 0.4));
      const look = out(seg(t, cue('station_look') - 0.1, cue('station_look') + 0.4));
      const act = out(seg(t, cue('station_act') - 0.1, cue('station_act') + 0.4));
      boxI.classList.toggle('hot', dec > 0.5);
      boxO.classList.toggle('hot', look > 0.5);
      flows.f1.classList.toggle('hot', look > 0.5);
      boxA.classList.toggle('hot', act > 0.5);
      flows.f2.classList.toggle('hot', act > 0.5);

      // flowing wires, always in motion
      flow(flows.f1, t, 100);
      flow(flows.f2, t, 100);
      flow(flows.f3, t, 90);
      flow(flows.f4, t, 90);

      // pulse around the square loop: o → intent → a → up → world → down → o
      const loop = ((t - s) * 0.13) % 1;
      const segs = [
        { a: [240, 392], b: [640, 392], w: 0.18 },
        { a: [640, 392], b: [1040, 392], w: 0.18 },
        { a: [1040, 392], b: [1040, 118], w: 0.16 },
        { a: [1040, 118], b: [316, 118], w: 0.22 },
        { a: [316, 118], b: [240, 392], w: 0.26 },
      ];
      let acc = 0;
      let x = 240, y = 392;
      for (const sg of segs) {
        if (loop <= acc + sg.w) {
          const k = (loop - acc) / sg.w;
          x = sg.a[0] + (sg.b[0] - sg.a[0]) * k;
          y = sg.a[1] + (sg.b[1] - sg.a[1]) * k;
          break;
        }
        acc += sg.w;
      }
      pulse.setAttribute('cx', x);
      pulse.setAttribute('cy', y);

      pathname.style.opacity = out(seg(t, cue('pathway_name') - 0.1, cue('pathway_name') + 0.5));
      pathname.classList.toggle('hot', out(seg(t, cue('pathway_name') - 0.1, cue('pathway_name') + 0.5)) > 0.5);

      // phase B: the fan-out to the three signals
      const tl = out(seg(t, cue('timeline') - 0.2, cue('timeline') + 0.6));
      Object.entries(leads).forEach(([key, l]) => {
        const p = out(seg(t, sCue[key] - 0.15, sCue[key] + 0.5));
        l.style.opacity = Math.max(tl * 0.25, p);
        if (p > 0.05 || tl > 0.05) flow(l, t, 70);
      });

      lanes.forEach(box => {
        const key = box.dataset.s;
        const p = out(seg(t, sCue[key] - 0.15, sCue[key] + 0.55));
        box.style.opacity = 0.32 + 0.68 * Math.max(tl, p);
        box.classList.toggle('on', p > 0.5);
        const q = out(seg(t, sCue[key] + 0.1, sCue[key] + 1.1));
        box.querySelector('canvas').style.clipPath = `inset(0 ${(1 - q) * 100}% 0 0)`;
      });

      const sum = out(seg(t, cue('sum') - 0.1, cue('sum') + 0.5));
      one.style.opacity = sum;
      one.style.transform = `translateY(${(1 - sum) * 10}px)`;
      if (sum > 0.5) pathname.style.fill = '#1f5f96';
    }
    return { el: root, render };
  }

  /* ============================================================
     05 · DATASET
     ============================================================ */
  function buildDataset() {
    const root = el('div');
    const bgr = el('div', 'bgr');
    const thumbs = window.THUMBS || [];
    for (let i = 0; i < 20; i++) {
      const item = thumbs[(i * 5) % thumbs.length];
      if (!item) break;
      const d = el('div', 'mini');
      d.style.left = ((i % 5) * 20 - 4) + '%';
      d.style.top = (Math.floor(i / 5) * 27 - 6) + '%';
      d.style.transform = `rotate(${(i % 3 - 1) * 1.2}deg)`;
      const img = new Image(); img.src = item.src; d.appendChild(img);
      bgr.appendChild(d);
    }
    root.appendChild(bgr);
    root.insertAdjacentHTML('beforeend', `
      <div class="head">
        <div class="kicker">03 <span class="dot">·</span> THE DATASET</div>
        <h2>A corpus built to measure the pathway.</h2>
      </div>
      <div class="sign">BAAI · AHADATA GROUP<br>ARXIV 2611.26434</div>
      <div class="big"><span class="num" id="count">0</span><span class="unit">hours</span></div>
      <div class="facts">
        <div class="fact"><div class="v">38</div><div class="l">scene classes</div></div>
        <div class="fact"><div class="v">3</div><div class="l">tiers of intent proxies</div></div>
        <div class="fact"><div class="v">7</div><div class="l">sensor modalities</div></div>
        <div class="fact"><div class="v">1</div><div class="l">shared clock and frame</div></div>
      </div>`);
    const head = root.querySelector('.head');
    const count = root.querySelector('#count');
    const big = root.querySelector('.big');
    const facts = root.querySelector('.facts');
    const b = beat('dataset');
    const s = b ? b.start : 100;
    const total = 12500;

    function render(t) {
      const hp = out(seg(t, s - 0.35, s + 0.55));
      head.style.opacity = hp;
      head.style.transform = `translateY(${(1 - hp) * 16}px)`;
      bgr.style.opacity = 0.05 * out(seg(t, s - 0.4, s + 1));
      bgr.style.transform = `scale(${1.04 - 0.03 * seg(t, s, b ? b.scene_end : s + 20)})`;
      const cp = out(seg(t, cue('hours') - 0.1, cue('hours') + 1.9));
      const val = Math.round(total * cp);
      count.textContent = fmtInt(val);
      big.style.opacity = out(seg(t, cue('hours') - 0.3, cue('hours') + 0.9));
      big.style.transform = `translateY(${(1 - out(seg(t, cue('hours') - 0.3, cue('hours') + 1))) * 18}px)`;
      const fp = out(seg(t, cue('scenes') - 0.1, cue('scenes') + 0.6));
      facts.style.opacity = fp;
      facts.style.transform = `translateY(${(1 - fp) * 14}px)`;
    }
    return { el: root, render };
  }

  /* ============================================================
     04 · INTENT PROXIES — three tiers, enlarged, plus the
     modality matrix that says what each tier adds
     ============================================================ */
  const WEAR = {
    l1: { name: 'Attention', hours: '10,000 h', proxy: 'gaze inferred from the head camera', where: 'the output end',
          img: 'wear-l1.png', devices: [['headband', 'headband', 0]] },
    l2: { name: 'Exertion', hours: '2,000 h', proxy: '+ bilateral surface EMG', where: 'midway',
          img: 'wear-l2.png', devices: [['headband', 'headband', 0], ['emg', 'EMG', 0]] },
    l3: { name: 'Cognition', hours: '500 h', proxy: '+ scalp EEG · controlled kit', where: 'the origin',
          img: 'wear-l3.png', devices: [['headband', 'headband', 0], ['emg', 'EMG', 0], ['eeg-cap', 'EEG cap', 1],
            ['wrist-camera', 'wrist cam', 1], ['eye-tracker', 'eye tracker', 1], ['gloves', 'gloves', 1], ['tracker', 'vive', 1]] },
  };
  /* matrix: which tier adds which proxy. 0 = absent, 1 = inferred, 2 = measured */
  const TIER_MATRIX = {
    l1: [['gaze', 1], ['EMG', 0], ['EEG', 0], ['eye + glove', 0]],
    l2: [['gaze', 1], ['EMG', 2], ['EEG', 0], ['eye + glove', 0]],
    l3: [['gaze', 2], ['EMG', 2], ['EEG', 2], ['eye + glove', 2]],
  };

  function buildTiers() {
    const root = el('div');
    root.innerHTML = `
      <div class="head">
        <div class="kicker">04 <span class="dot">·</span> INTENT PROXIES</div>
        <h2>Three tiers of intent proxies.</h2>
        <p class="lead">Each tier adds one proxy, and inherits every proxy below it.</p>
      </div>
      <div class="tr2-stack"></div>
      <div class="tr2-table">
        <div class="tr2-tcap">what each tier adds</div>
        <div class="tr2-grid">
          <div class="tr2-hd"></div><div class="tr2-hd">gaze</div><div class="tr2-hd">EMG</div><div class="tr2-hd">EEG</div><div class="tr2-hd">eye + glove</div>
          ${['l1', 'l2', 'l3'].map((k, i) => `
            <div class="tr2-tn" data-t="${k}"><b>L${i + 1}</b><span>${WEAR[k].name}</span></div>
            ${TIER_MATRIX[k].map(([lab, v]) => `<div class="tr2-cell" data-t="${k}" data-v="${v}"><i class="${v === 0 ? 'off' : v === 1 ? 'inf' : 'meas'}"></i><em>${v === 0 ? '—' : v === 1 ? 'inferred' : 'measured'}</em></div>`).join('')}
          `).join('')}
        </div>
        <div class="tr2-legend">
          <div class="tr2-lrow"><i style="background:#0f6f68"></i><b>gaze</b><span>early orienting</span></div>
          <div class="tr2-lrow"><i style="background:#8a6136"></i><b>EMG</b><span>pre-contact load</span></div>
          <div class="tr2-lrow"><i style="background:#6a4c9c"></i><b>EEG</b><span>pre-movement preparation</span></div>
          <div class="tr2-lrow"><i style="background:#b9a6d6;border-radius:3px"></i><b>eye + glove</b><span>measured in controlled L3</span></div>
        </div>
        <div class="tr2-tfoot">solid = open + controlled<br>dashed = controlled only</div>
      </div>
      <div class="tr2-foot">each tier inherits every proxy below &nbsp;·&nbsp; 12,500 h &nbsp;·&nbsp; one task ontology &nbsp;·&nbsp; one clock</div>`;
    const stack = root.querySelector('.tr2-stack');
    const rows = {};
    ['l1', 'l2', 'l3'].forEach((k, i) => {
      const d = WEAR[k];
      const row = el('div', 'tr2');
      row.dataset.c = k;
      row.style.top = (i * 224) + 'px';
      row.innerHTML = `
        <div class="tr2-img"><img src="assets/wear/${d.img}" alt=""></div>
        <div class="tr2-info">
          <div class="tr2-t">L${i + 1} · ${d.name}</div>
          <div class="tr2-h">${d.hours}</div>
          <div class="tr2-p">${d.proxy}</div>
        </div>
        <div class="tr2-dev"></div>
        <div class="tr2-where">${d.where}</div>`;
      const dev = row.querySelector('.tr2-dev');
      d.devices.forEach(([icon, label, ctrl], j) => {
        const chip = el('div', 'tr2-chip' + (ctrl ? ' ctrl' : ''));
        chip.innerHTML = `<i style="color:${j === 0 ? '#1f5f96' : j === 1 ? '#0f6f68' : '#6a4c9c'}">${j + 1}</i>
          <img src="assets/hardware/${icon}.png" alt=""><span>${label}</span>`;
        dev.appendChild(chip);
      });
      stack.appendChild(row);
      rows[k] = row;
      if (i < 2) {
        const link = el('div', 'tr2-link');
        link.innerHTML = '<i></i><em>+</em>';
        link.style.top = (i * 224 + 196 - 13) + 'px';
        stack.appendChild(link);
        rows['link' + i] = link;
      }
    });

    const b = beat('tiers');
    const s = b ? b.start : 120;
    const order = ['l1', 'l2', 'l3'];

    function render(t) {
      const hp = out(seg(t, s - 0.35, s + 0.5));
      root.querySelector('.head').style.opacity = hp;
      root.querySelector('.head').style.transform = `translateY(${(1 - hp) * 16}px)`;

      order.forEach((k, i) => {
        const row = rows[k];
        const c = cue(k);
        const p = out(seg(t, c - 0.25, c + 0.55));
        row.style.opacity = 0.1 + 0.9 * p;
        row.style.transform = `translateX(${(1 - p) * -26}px)`;
        row.querySelector('.tr2-img').style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
        row.querySelector('.tr2-info').style.opacity = out(seg(t, c - 0.05, c + 0.45));
        [...row.querySelectorAll('.tr2-chip')].forEach((chip, j) => {
          const q = out(seg(t, c + 0.2 + j * 0.08, c + 0.55 + j * 0.08));
          chip.style.opacity = q;
          chip.style.transform = `scale(${0.84 + 0.16 * q})`;
        });
        if (i > 0) {
          const link = rows['link' + (i - 1)];
          const q = out(seg(t, c - 0.15, c + 0.3));
          link.style.opacity = q;
          link.querySelector('i').style.transform = `scaleY(${q})`;
          link.querySelector('em').style.transform = `scale(${0.6 + 0.4 * q})`;
        }
        // matrix row
        root.querySelectorAll(`.tr2-grid [data-t="${k}"]`).forEach(cell => {
          cell.style.opacity = out(seg(t, c + 0.1, c + 0.5));
        });
      });

      const fp = out(seg(t, cue('inherit') - 0.1, cue('inherit') + 0.7));
      root.querySelector('.tr2-foot').style.opacity = 0.2 + 0.8 * fp;
      root.querySelector('.tr2-table').style.opacity = out(seg(t, cue('l1') - 0.2, cue('l1') + 0.6));
    }
    return { el: root, render };
  }

  /* ============================================================
     05 · ONE EPISODE — the released L3-001, on one clock:
     playable views, the 3-D hands on real VIVE trajectories,
     five annotated steps
     ============================================================ */
  /* — ported from display/src/data/handPose.ts: glove→tracker mount — */
  const P3 = {
    eulerDeg(r, p, y) {
      const R = Math.PI / 180, cr = Math.cos(r * R), sr = Math.sin(r * R),
        cp = Math.cos(p * R), sp = Math.sin(p * R), cy = Math.cos(y * R), sy = Math.sin(y * R);
      const Rx = [[1, 0, 0], [0, cr, -sr], [0, sr, cr]];
      const Ry = [[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]];
      const Rz = [[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]];
      return P3.mul(P3.mul(Rz, Ry), Rx);
    },
    mul(A, B) {
      const O = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
        O[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
      return O;
    },
    mv(R, v) {
      return [
        R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
        R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
        R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
      ];
    },
    HAND_C: {
      left: [[-0.2705, 0.9583, -0.0925], [0.0951, -0.069, -0.9931], [0.958, 0.2774, 0.0725]],
      right: [[-0.2723, -0.9589, -0.0796], [-0.0949, -0.0556, 0.9939], [0.9575, -0.2782, 0.0758]],
    },
    HAND_OFFSET: { left: [0.0059, -0.0519, -0.048], right: [-0.0059, -0.0518, -0.048] },
    handNodes(side, wrist, euler, local) {
      const Rp = P3.eulerDeg(euler[0], euler[1], euler[2]);
      const C = P3.HAND_C[side];
      const off = P3.HAND_OFFSET[side];
      return local.map(p => {
        const c = P3.mv(C, p);
        const w = P3.mv(Rp, [c[0] + off[0], c[1] + off[1], c[2] + off[2]]);
        return [w[0] + wrist[0], w[1] + wrist[1], w[2] + wrist[2]];
      });
    },
  };

  const FCOUNT = 261;              // frames per view at 15 fps
  const FRATE = 15;

  function buildEpisode() {
    const D = window.L3 || null;
    const root = el('div');
    /* 6-column grid: head-left | head-right | cloud 2×2 | depth | eye
       row 2: wrist-left | wrist-right | (cloud) | manus&vive 2 cols */
    const VIEWS = [
      ['headband_left', 'HEAD · LEFT', '30 fps', 'p'],
      ['headband_right', 'HEAD · RIGHT', '30 fps', 'p'],
      ['wrist_left', 'WRIST · LEFT', '30 fps', 'p'],
      ['wrist_right', 'WRIST · RIGHT', '30 fps', 'p'],
      ['cloud', 'POINT CLOUD', '22,003 pts', 'cloud'],
      ['depth', 'DEPTH · STEREO', '1 frame', 'depthimg'],
      ['eye', 'EYE · GAZE', '200 Hz', 'eye'],
      ['hands', 'MANUS · VIVE 3D', '15 fps', 'hands'],
    ];
    const dur = D ? D.duration : 17.4;
    root.innerHTML = `
      <div class="head">
        <div class="kicker">05 <span class="dot">·</span> ONE EPISODE</div>
        <h2>One episode, on one clock.</h2>
      </div>
      <div class="ep2meta">L3 · CONTROLLED · L3-001<br><b>${D ? D.task : 'Sort candies by colour'}</b><br>${dur} s · 30 fps · 7 views</div>
      <div class="ep2-note" id="ep2note">controlled L3 · gaze and hand pose measured directly</div>
      <div class="ep2-grid"></div>
      <div class="ep2-sigs"></div>
      <div class="ep2-clock"><div class="ep2-line"></div><div class="ep2-play" id="ep2play"></div><div class="ep2-segs"></div></div>`;
    const grid = root.querySelector('.ep2-grid');
    const sigRow = root.querySelector('.ep2-sigs');
    const clock = root.querySelector('.ep2-clock');
    const segBox = root.querySelector('.ep2-segs');
    const play = root.querySelector('#ep2play');
    const vids = [];
    const panels = {};
    const frameCache = new Map();

    VIEWS.forEach(([key, label, tag, kind]) => {
      const p = el('div', 'ep2-p' + (kind !== 'p' ? ' ' + kind : ''));
      p.dataset.key = key;
      p.innerHTML = `<div class="ep2-tag">${label}</div><div class="ep2-res">${tag}</div>`;
      if (kind === 'cloud' || kind === 'hands') {
        const c = document.createElement('canvas');
        p.appendChild(c);
        panels[key] = { el: p, c, kind };
      } else if (kind === 'depthimg') {
        const img = new Image();
        img.src = 'assets/l3/depth.jpg';
        img.alt = '';
        p.appendChild(img);
        panels[key] = { el: p, kind };
      } else {
        // live: video. render: canvas over deterministic frame images.
        const cv = document.createElement('canvas');
        cv.width = 640; cv.height = 960;
        cv.style.display = 'none';
        p.appendChild(cv);
        if (!RENDER) {
          const v = video(`assets/l3/vid/${key}.mp4`);
          p.appendChild(v);
          vids.push(v);
        } else {
          cv.style.display = 'block';
        }
        panels[key] = { el: p, c: cv, key, kind };
      }
      grid.appendChild(p);
    });

    /* deterministic frame loader for the capture pass (LRU-capped) */
    const FRAME_CACHE_MAX = 350;
    function frameSrc(view, idx) {
      return `assets/l3/frames/${view}/${String(idx).padStart(5, '0')}.jpg`;
    }
    function loadFrame(view, idx) {
      const k = view + ':' + idx;
      if (frameCache.has(k)) {
        const im = frameCache.get(k);
        frameCache.delete(k);
        frameCache.set(k, im);            // refresh LRU position
        return Promise.resolve(im);
      }
      return new Promise(res => {
        const im = new Image();
        im.onload = () => {
          frameCache.set(k, im);
          while (frameCache.size > FRAME_CACHE_MAX) frameCache.delete(frameCache.keys().next().value);
          res(im);
        };
        im.onerror = () => res(null);
        im.src = frameSrc(view, idx);
      });
    }

    // gaze on the eye panel: a bright marker with a fading trail
    const eyeP = grid.querySelector('[data-key="eye"]');
    const gazeCv = el('canvas', 'ep2-gazecanvas');
    eyeP.appendChild(gazeCv);
    let gazeBounds = null;
    if (D && D.gaze) {
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const [gx, gy] of D.gaze) {
        if (gx < minx) minx = gx; if (gx > maxx) maxx = gx;
        if (gy < miny) miny = gy; if (gy > maxy) maxy = gy;
      }
      gazeBounds = [minx, maxx, miny, maxy];
    }
    const GAZE_TRAIL = 14;
    function drawGaze(local) {
      const w = gazeCv.parentElement.clientWidth || 281;
      const h = gazeCv.parentElement.clientHeight || 448;
      if (gazeCv.width !== w * 2) { gazeCv.width = w * 2; gazeCv.height = h * 2; }
      const ctx = gazeCv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(2, 2);
      ctx.clearRect(0, 0, w, h);
      if (!D || !gazeBounds) return;
      const dd = D.duration, at = ((local % dd) + dd) % dd;
      const i = Math.floor(at * D.fps) % D.gaze.length;
      for (let k = 0; k < GAZE_TRAIL; k++) {
        const j = (i - GAZE_TRAIL + k + D.gaze.length) % D.gaze.length;
        const [gx, gy] = D.gaze[j];
        const u = clamp((gx - gazeBounds[0]) / (gazeBounds[1] - gazeBounds[0] || 1), 0.03, 0.97);
        const v = clamp((gy - gazeBounds[2]) / (gazeBounds[3] - gazeBounds[2] || 1), 0.04, 0.96);
        const alpha = 0.1 + 0.75 * Math.pow(k / GAZE_TRAIL, 1.6);
        ctx.beginPath();
        ctx.arc(u * w, v * h, 3 + 9 * (k / GAZE_TRAIL), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(159,208,214,${alpha.toFixed(3)})`;
        ctx.fill();
      }
      const [gx, gy] = D.gaze[i];
      const u = clamp((gx - gazeBounds[0]) / (gazeBounds[1] - gazeBounds[0] || 1), 0.03, 0.97);
      const v = clamp((gy - gazeBounds[2]) / (gazeBounds[3] - gazeBounds[2] || 1), 0.04, 0.96);
      ctx.beginPath();
      ctx.arc(u * w, v * h, 14, 0, Math.PI * 2);
      ctx.strokeStyle = '#9fd0d6';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(u * w, v * h, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#9fd0d6';
      ctx.fill();
    }

    // signals — the released episode's own waveforms, drawn as heatmaps
    // eeg: 4 ch · emg: 8 ch (left 4 + right 4) · gaze: x/y at 30 fps
    const gazeSeries = D && D.gaze
      ? { rate: D.fps, channels: ['x', 'y'], series: [D.gaze.map(p => p[0]), D.gaze.map(p => p[1])] }
      : null;
    const sigDefs = [
      { key: 'eeg', label: 'EEG · 4 CHANNELS', color: '#96b4ec' },
      { key: 'emg', label: 'EMG · 8 CHANNELS · L + R', color: '#f2a95c' },
      { key: 'gaze', label: 'GAZE · X / Y', color: '#6fe0d6' },
    ];
    const sigs = sigDefs.map(({ key, label, color }) => {
      const box = el('div', 'ep2-s');
      box.innerHTML = `<div class="ep2-tag">${label}</div><div class="ep2-res">native rates</div>`;
      const c = document.createElement('canvas');
      box.appendChild(c);
      sigRow.appendChild(box);
      return { key, c, color };
    });
    /* clean polylines: one thin line per channel on the dark panel */
    function drawSignals(t) {
      const dd = D ? D.duration : 17.4;
      const at = ((t % dd) + dd) % dd;
      sigs.forEach(({ key, c, color }) => {
        const box = c.parentElement;
        const w = Math.max(120, Math.round(box.clientWidth));
        const h = Math.max(50, Math.round(box.clientHeight));
        if (c.width !== w * 2) { c.width = w * 2; c.height = h * 2; }
        const ctx = c.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(2, 2);
        ctx.clearRect(0, 0, w, h);
        // pick the series: eeg = 4ch, emg = left 4 + right 4, gaze = x/y
        let series = null, rate = 60, labels = [];
        if (key === 'eeg' && D && D.waves.eeg) {
          series = D.waves.eeg.series; rate = D.waves.eeg.rate; labels = D.waves.eeg.channels;
        } else if (key === 'emg' && D && D.waves.leftEmg && D.waves.rightEmg) {
          series = [...D.waves.leftEmg.series, ...D.waves.rightEmg.series];
          rate = D.waves.leftEmg.rate;
          labels = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
        } else if (key === 'gaze' && gazeSeries) {
          series = gazeSeries.series; rate = gazeSeries.rate; labels = ['x', 'y'];
        }
        if (!series || !series.length) return;
        const n = series[0].length;
        const padL = 30, padR = 8, padT = 26, padB = 10;
        const chH = (h - padT - padB) / series.length;
        const span = 8;
        const i0 = Math.floor(at * rate);
        const count = Math.min(n, Math.floor(span * rate));
        const x0 = padL, x1 = w - padR;
        // faint grid + baselines + labels
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx <= 8; gx++) {
          const xx = x0 + (x1 - x0) * gx / 8;
          ctx.beginPath(); ctx.moveTo(xx, padT - 4); ctx.lineTo(xx, h - padB); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.11)';
        ctx.font = '9px Mono, monospace';
        series.forEach((data, ci) => {
          const base = padT + ci * chH + chH / 2;
          ctx.beginPath(); ctx.moveTo(x0, base); ctx.lineTo(x1, base); ctx.stroke();
          ctx.fillStyle = 'rgba(205,224,236,0.7)';
          ctx.fillText(labels[ci] || String(ci + 1), 4, base + 3);
        });
        // per-channel polyline, normalised to its own window range
        series.forEach((data, ci) => {
          let min = Infinity, max = -Infinity;
          for (let k = 0; k < count; k++) {
            const v = data[(i0 - count + k + n * 2) % n];
            if (v < min) min = v; if (v > max) max = v;
          }
          const amp = Math.max(1e-6, max - min) / 2;
          const base = padT + ci * chH + chH / 2;
          const gain = chH * 0.34;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          for (let k = 0; k < count; k++) {
            const v = data[(i0 - count + k + n * 2) % n];
            const x = x0 + (k / count) * (x1 - x0);
            const y = base - ((v - (min + max) / 2) / amp) * gain;
            k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        });
      });
    }

    // task clock: five annotated steps — shade spans + midpoint labels
    const steps = (D && D.steps) || [];
    const stepLabs = [];
    steps.forEach((st, i) => {
      const s2 = el('div', 'ep2-seg');
      s2.style.left = (st.t0 / dur * 100) + '%';
      s2.style.width = ((st.t1 - st.t0) / dur * 100) + '%';
      segBox.appendChild(s2);
      const lab = el('div', 'ep2-seglab' + (i % 2 ? ' up' : ''));
      lab.style.left = (st.t / dur * 100) + '%';
      lab.textContent = `${i + 1} · ${st.label}`;
      segBox.appendChild(lab);
      stepLabs.push(lab);
    });

    const cloudPts = D ? (() => {
      const p = D.cloud.points, n = p.length / 3;
      const arr = new Float32Array(n * 3);
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < n; i++) {
        arr[i * 3] = p[i * 3] / 1000; arr[i * 3 + 1] = p[i * 3 + 1] / 1000; arr[i * 3 + 2] = p[i * 3 + 2] / 1000;
        cx += arr[i * 3]; cy += arr[i * 3 + 1]; cz += arr[i * 3 + 2];
      }
      cx /= n; cy /= n; cz /= n;
      for (let i = 0; i < n; i++) { arr[i * 3] -= cx; arr[i * 3 + 1] -= cy; arr[i * 3 + 2] -= cz; }
      return { arr, cols: D.cloud.colors, depths: D.cloud.depths, n };
    })() : null;

    function drawCloud(t, cv) {
      const w = Math.max(120, Math.round(cv.parentElement.clientWidth || 574));
      const h = Math.max(80, Math.round(cv.parentElement.clientHeight || 448));
      if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; }
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(2, 2);
      ctx.fillStyle = '#0a131b'; ctx.fillRect(0, 0, w, h);
      if (!cloudPts) return;
      const { arr, cols, depths, n } = cloudPts;
      const ang = 0.55 + Math.sin(t * 0.22) * 0.32, tilt = -0.22;
      const ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(tilt), st = Math.sin(tilt);
      const ramp = d => {
        const s2 = [[0, 219, 78, 46], [0.3, 233, 183, 74], [0.55, 120, 200, 130], [0.8, 54, 170, 200], [1, 47, 90, 200]];
        for (let k = 1; k < s2.length; k++) if (d <= s2[k][0]) {
          const a = s2[k - 1], b2 = s2[k], f = (d - a[0]) / (b2[0] - a[0]);
          return [a[1] + (b2[1] - a[1]) * f, a[2] + (b2[2] - a[2]) * f, a[3] + (b2[3] - a[3]) * f];
        }
        return [47, 90, 200];
      };
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      const proj = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x0 = arr[i * 3], y0 = arr[i * 3 + 1], z0 = arr[i * 3 + 2];
        const y1 = y0 * ct - z0 * st, z1 = y0 * st + z0 * ct;
        const x2 = x0 * ca + z1 * sa, z2 = -x0 * sa + z1 * ca;
        const persp = 2.9 / (2.9 + z2 * 0.55);
        proj[i * 3] = x2 * persp; proj[i * 3 + 1] = y1 * persp; proj[i * 3 + 2] = persp;
        if (x2 * persp < minx) minx = x2 * persp; if (x2 * persp > maxx) maxx = x2 * persp;
        if (y1 * persp < miny) miny = y1 * persp; if (y1 * persp > maxy) maxy = y1 * persp;
      }
      const sc = Math.min(w * 0.84 / (maxx - minx || 1), h * 0.8 / (maxy - miny || 1));
      const cx = w / 2 - ((minx + maxx) / 2) * sc, cy = h / 2 - ((miny + maxy) / 2) * sc;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i += 2) {
        const sx = cx + proj[i * 3] * sc, sy = cy + proj[i * 3 + 1] * sc;
        const tc = ramp(depths[i] / 255), mix = 0.55;
        const r = Math.round(cols[i * 3] * (1 - mix) + tc[0] * mix);
        const g2 = Math.round(cols[i * 3 + 1] * (1 - mix) + tc[1] * mix);
        const b3 = Math.round(cols[i * 3 + 2] * (1 - mix) + tc[2] * mix);
        ctx.fillStyle = `rgba(${r},${g2},${b3},0.5)`;
        ctx.fillRect(sx, sy, 1.4, 1.4);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /* ---- the 3-D hands scene: real VIVE trajectories ---- */
    const chains = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24]];
    const palmTris = [[0, 5, 10], [0, 10, 15], [0, 15, 20], [5, 6, 11], [5, 11, 10], [10, 11, 16], [10, 16, 15], [15, 16, 21], [15, 21, 20]];
    const HANDS3 = [{ side: 'left', base: 0, color: '#9cc3e2' }, { side: 'right', base: 25, color: '#9fd0d6' }];
    let ep3 = null;
    if (D && D.poses && D.hands) {
      const n = Math.min(D.poses.head.length, D.hands.length);
      const center = [0, 0, 0];
      let count = 0;
      for (let i = 0; i < n; i++) {
        for (const k of ['head', 'left', 'right']) {
          const p = D.poses[k][i].p;
          center[0] += p[0]; center[1] += p[1]; center[2] += p[2]; count++;
        }
      }
      center[0] /= count; center[1] /= count; center[2] /= count;
      let extent = 0.2, lowestY = 1e9;
      // framing: centred on the workspace the wrists actually sweep,
      // so the hands and their trajectories fill the panel
      const wristC = [0, 0, 0];
      let wristN = 0, wristExt = 0.05;
      const frames = [];
      for (let i = 0; i < n; i++) {
        const f = {};
        for (const k of ['head', 'left', 'right']) {
          const p = D.poses[k][i].p;
          f[k] = p;
          const dx = p[0] - center[0], dy = p[1] - center[1], dz = p[2] - center[2];
          extent = Math.max(extent, Math.hypot(dx, dy, dz));
          if (k !== 'head') {
            if (p[1] < lowestY) lowestY = p[1];
            wristC[0] += p[0]; wristC[1] += p[1]; wristC[2] += p[2]; wristN++;
          }
        }
        for (const h of HANDS3) {
          const wrist = f[h.side];
          const euler = D.poses[h.side][i].e;
          const local = D.hands[i].slice(h.base, h.base + 25);
          f[h.side + 'Nodes'] = P3.handNodes(h.side, wrist, euler, local);
        }
        frames.push(f);
      }
      wristC[0] /= wristN; wristC[1] /= wristN; wristC[2] /= wristN;
      for (let i = 0; i < n; i++) {
        for (const k of ['left', 'right']) {
          const p = D.poses[k][i].p;
          wristExt = Math.max(wristExt, Math.hypot(p[0] - wristC[0], p[1] - wristC[1], p[2] - wristC[2]));
        }
      }
      ep3 = { frames, n, center: wristC, extent: Math.max(0.17, wristExt * 1.55), planeY: lowestY };
    }

    const TRAIL = 40;
    function drawHands3D(t, cv) {
      const w = Math.max(120, Math.round(cv.parentElement.clientWidth || 281));
      const h = Math.max(80, Math.round(cv.parentElement.clientHeight || 448));
      if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; }
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(2, 2);
      ctx.fillStyle = '#0a131b'; ctx.fillRect(0, 0, w, h);
      if (!ep3) {
        ctx.fillStyle = 'rgba(200,220,235,0.5)';
        ctx.font = '15px Mono, monospace';
        ctx.fillText('measured hand pose — loading', 24, h / 2);
        return;
      }
      const { frames, n, center, extent, planeY } = ep3;
      const idx = Math.floor((t * FRATE) % n + n) % n;
      const f = frames[idx];

      // camera: gentle auto-orbit around the scene
      const th = 0.34 + Math.sin(t * 0.3) * 0.11;
      const ph = 0.4 + Math.cos(t * 0.23) * 0.05;
      const cth = Math.cos(th), sth = Math.sin(th), cph = Math.cos(ph), sph = Math.sin(ph);
      const scale = Math.min(w * 0.92, h * 0.8) / (extent * 1.35);
      const ox = w / 2 + Math.sin(t * 0.3) * 6, oy = h * 0.5 + 8;
      const proj = p => {
        const x0 = p[0] - center[0], y0 = p[1] - center[1], z0 = p[2] - center[2];
        const y1 = y0 * cph - z0 * sph, z1 = y0 * sph + z0 * cph;
        const x2 = x0 * cth + z1 * sth, z2 = -x0 * sth + z1 * cth;
        const f2 = 1 / (1 - z2 * 0.12);
        return [ox + x2 * scale * f2, oy - y1 * scale * f2, z2];
      };

      // floor grid at the lowest measured wrist height
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      const half = extent * 1.5;
      for (let gx = -4; gx <= 4; gx++) {
        const [a] = proj([center[0] + gx * half / 4, planeY, center[2] - half]);
        const [b] = proj([center[0] + gx * half / 4, planeY, center[2] + half]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      for (let gz = -4; gz <= 4; gz++) {
        const [a] = proj([center[0] - half, planeY, center[2] + gz * half / 4]);
        const [b] = proj([center[0] + half, planeY, center[2] + gz * half / 4]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }

      // wrist trails: where the hands actually travelled
      HANDS3.forEach((h2, hi) => {
        ctx.strokeStyle = h2.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (let k = 0; k < TRAIL; k++) {
          const fi = (idx - TRAIL + k + n * 2) % n;
          const [a] = proj(frames[fi][h2.side]);
          const [b] = proj(frames[(fi + 1) % n][h2.side]);
          ctx.globalAlpha = 0.04 + 0.62 * (k / TRAIL);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // the hand itself: bones + palm + nodes, at its measured position
        const nodes = f[h2.side + 'Nodes'];
        const pp = nodes.map(proj);
        ctx.strokeStyle = h2.color;
        ctx.lineCap = 'round';
        // soft glow pass, then the crisp bones
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 5;
        chains.forEach(ch => {
          ctx.beginPath();
          ch.forEach((i, k2) => { k2 ? ctx.lineTo(pp[i][0], pp[i][1]) : ctx.moveTo(pp[i][0], pp[i][1]); });
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.2;
        chains.forEach(ch => {
          ctx.beginPath();
          ch.forEach((i, k2) => { k2 ? ctx.lineTo(pp[i][0], pp[i][1]) : ctx.moveTo(pp[i][0], pp[i][1]); });
          ctx.stroke();
        });
        ctx.fillStyle = h2.color;
        ctx.globalAlpha = 0.2;
        palmTris.forEach(tr => {
          ctx.beginPath();
          ctx.moveTo(pp[tr[0]][0], pp[tr[0]][1]);
          ctx.lineTo(pp[tr[1]][0], pp[tr[1]][1]);
          ctx.lineTo(pp[tr[2]][0], pp[tr[2]][1]);
          ctx.closePath(); ctx.fill();
        });
        ctx.globalAlpha = 1;
        pp.forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2); ctx.fill(); });
      });

      // head marker, only while it projects inside the panel
      const [hp] = proj(f.head);
      if (hp[0] > 6 && hp[0] < w - 6 && hp[1] > 6 && hp[1] < h + 16) {
        ctx.strokeStyle = '#7f97a8';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(hp[0], hp[1], 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(159,208,214,0.8)';
        ctx.font = '11px Mono, monospace';
        ctx.fillText('head', hp[0] + 9, hp[1] + 3);
      }

      ctx.fillStyle = 'rgba(200,220,235,0.55)';
      ctx.font = '11px Mono, monospace';
      ctx.fillText('VIVE · 6-DOF · 20 ANGLES / HAND', 12, 20);
    }

    const b = beat('episode');
    const s = b ? b.start : 150;

    function panelOn(key, v) {
      const p = grid.querySelector(`[data-key="${key}"]`);
      if (p) p.style.setProperty('--hot', v);
    }

    function render(t) {
      const local = Math.max(0, t - s);
      const hp = out(seg(t, s - 0.35, s + 0.5));
      root.querySelector('.head').style.opacity = hp;
      root.querySelector('.head').style.transform = `translateY(${(1 - hp) * 16}px)`;
      root.querySelector('.ep2meta').style.opacity = out(seg(t, s + 0.1, s + 0.7));
      const gp = out(seg(t, s - 0.2, s + 0.7));
      grid.style.opacity = gp;
      grid.style.transform = `translateY(${(1 - gp) * 16}px)`;

      const vp = out(seg(t, cue('views') - 0.2, cue('views') + 0.4));
      ['headband_left', 'headband_right', 'wrist_left', 'wrist_right', 'eye']
        .forEach(k => panelOn(k, vp * 0.5));
      const vp2 = out(seg(t, cue('views_more') - 0.2, cue('views_more') + 0.4));
      ['wrist_left', 'wrist_right'].forEach(k => panelOn(k, Math.max(vp * 0.5, vp2 * 0.6)));
      panelOn('cloud', Math.max(out(seg(t, cue('cloud') - 0.2, cue('cloud') + 0.4)), out(seg(t, cue('depth') - 0.2, cue('depth') + 0.4)) * 0.5));
      const dp2 = out(seg(t, cue('depth') - 0.25, cue('depth') + 0.5));
      const hp2 = out(seg(t, cue('hand') - 0.25, cue('hand') + 0.45));
      panelOn('hands', hp2);
      grid.querySelector('[data-key="hands"]').classList.toggle('on', hp2 > 0.5);

      const sp = out(seg(t, cue('signals') - 0.2, cue('signals') + 0.6));
      sigRow.style.opacity = 0.35 + 0.65 * sp;
      const mp = out(seg(t, cue('measured') - 0.2, cue('measured') + 0.6));
      root.querySelector('#ep2note').style.opacity = mp;
      root.querySelector('#ep2note').style.transform = `translateY(${(1 - mp) * 6}px)`;
      eyeP.style.setProperty('--hot', Math.max(vp * 0.5, mp));
      const depthP = grid.querySelector('[data-key="depth"]');
      if (depthP) depthP.style.setProperty('--hot', Math.max(dp2, mp));
      grid.querySelector('[data-key="hands"]').style.setProperty('--hot', Math.max(hp2, mp));

      drawCloud(local, panels.cloud.c);
      drawHands3D(local, panels.hands.c);
      drawSignals(local);
      drawGaze(local);

      // task clock: the playhead and the active annotated step
      play.style.left = (((local % dur) + dur) % dur / dur * 100) + '%';
      const active = steps.filter(st => st.t <= local % dur).pop();
      [...clock.querySelectorAll('.ep2-seg')].forEach((el2, i) => {
        el2.classList.toggle('on', !!active && steps[i].id === active.id);
        el2.style.opacity = out(seg(t, s + 1 + i * 0.1, s + 1.6 + i * 0.1));
      });
      stepLabs.forEach((lab, i) => {
        lab.classList.toggle('on', !!active && steps[i].id === active.id);
        lab.style.opacity = out(seg(t, s + 1.2 + i * 0.1, s + 1.8 + i * 0.1));
      });

      // video panels: deterministic frames in render mode, synced videos live
      if (RENDER) {
        const tasks = [];
        for (const [key, panel] of Object.entries(panels)) {
          if (!panel.key) continue;
          const idx = (Math.floor(((local % dur) + dur) % dur * FRATE) % FCOUNT) + 1;
          tasks.push(loadFrame(key, idx).then(im => {
            if (!im) return;
            const ctx = panel.c.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(im, 0, 0, panel.c.width, panel.c.height);
          }));
        }
        return Promise.all(tasks);
      }
      return seekAll(vids, local);
    }
    return { el: root, render };
  }

  /* ============================================================
     08 · DISTRIBUTIONS
     ============================================================ */
  /* ---- the report's Fig. 2 data, ported from the project page ---- */
  const VERB_NAMES = ['pick', 'place', 'pour', 'wipe', 'tighten', 'chop', 'open', 'close', 'lift', 'hold',
    'screw', 'scrub', 'grasp', 'release', 'rotate', 'flip', 'push', 'slide', 'align', 'attach',
    'detach', 'empty', 'cut', 'peel', 'fold', 'unfold', 'write', 'unwrap', 'remove', 'replace',
    'disconnect', 'plug', 'unplug', 'loosen', 'hook', 'snap', 'scrape', 'scoop', 'sprinkle', 'blend',
    'knead', 'flatten', 'shape', 'mold', 'clamp', 'glue', 'seal', 'label', 'sort', 'count',
    'weigh', 'measure', 'mark', 'erase', 'type', 'click', 'drag', 'catch', 'drop', 'take',
    'give', 'grab', 'shake', 'hang', 'fill', 'stir', 'mix', 'carry', 'move', 'transfer',
    'pull', 'lower', 'raise', 'turn', 'press', 'tap', 'insert', 'seat', 'fasten', 'verify'];
  const VERB_COUNTS = [78, 72, 66, 60, 55, 51, 47, 43, 39, 36, 28, 26, 25, 24, 23, 22, 21, 20, 19, 18,
    16, 15, 15, 14, 14, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9, 8,
    8, 8, 7, 7, 7, 7, 6, 6, 6, 6, 6, 5, 5, 5, 5, 5, 4, 4, 4, 4,
    4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  const L2_ORIGIN = new Set(['chop', 'scrub', 'rotate', 'flip', 'slide', 'align', 'empty', 'cut', 'peel', 'fold',
    'unfold', 'unwrap', 'remove', 'replace', 'disconnect', 'unplug', 'hook', 'snap', 'scrape', 'scoop', 'sprinkle',
    'blend', 'flatten', 'shape', 'mold', 'clamp', 'glue', 'seal', 'label', 'sort', 'count', 'weigh', 'measure',
    'mark', 'drag', 'insert']);
  const L3_ORIGIN = new Set(['tighten', 'screw', 'attach', 'detach', 'plug', 'loosen', 'knead', 'seat', 'fasten', 'verify']);
  const ORIGIN_SPLIT = { L1: [0.74, 0.18, 0.08], L2: [0.55, 0.3, 0.15], L3: [0.38, 0.28, 0.34] };
  const VERBS80 = VERB_NAMES.map((verb, i) => {
    const total = VERB_COUNTS[i];
    const origin = L3_ORIGIN.has(verb) ? 'L3' : L2_ORIGIN.has(verb) ? 'L2' : 'L1';
    const [a, b] = ORIGIN_SPLIT[origin];
    const l1 = Math.round(total * a);
    const l2 = Math.round(total * b);
    return { name: verb, total, tiers: { L1: l1, L2: l2, L3: total - l1 - l2 } };
  });

  const OBJECT_BASES = ['jar', 'sponge', 'bottle', 'detergent', 'tupper', 'ruler', 'marker', 'mat', 'lamp', 'towel',
    'apron', 'sprayer', 'pen', 'scraper', 'vinegar', 'spatula', 'scissors', 'box', 'pepper', 'bowl',
    'cable', 'cloth', 'chip', 'washer', 'salt', 'bin', 'eraser', 'sticker', 'pencil', 'onion',
    'nut', 'cup', 'mug', 'plate', 'fork', 'knife', 'spoon', 'brush', 'comb', 'soap',
    'shampoo', 'toothbrush', 'toothpaste', 'battery', 'charger', 'tape', 'glue', 'clamp', 'screw',
    'bolt', 'key', 'card', 'envelope', 'folder', 'notebook', 'highlighter', 'stapler', 'clip', 'peg', 'tray'];
  const OBJECT_QUALS = ['red', 'small', 'clear', 'blue', 'green', 'yellow', 'white', 'brown', 'black', 'silver'];
  const OBJECT_HEAD = ['red jar', 'small sponge', 'clear bottle', 'blue detergent', 'green tupper', 'red ruler',
    'black marker', 'blue mat', 'small lamp', 'yellow banana', 'white cup', 'brown apron',
    'clear sprayer', 'green bottle', 'silver scraper', 'olive oil', 'green vinegar',
    'small spatula', 'green mat', 'yellow scissors', 'brown box', 'red bowl', 'blue pen',
    'black cable', 'red cloth', 'white washer', 'blue towel', 'salt', 'brown bin', 'black eraser',
    'white pencil', 'blue cup', 'green tray', 'red sticker', 'clear folder', 'white notebook'];
  function objectNames() {
    const names = [...OBJECT_HEAD];
    const used = new Set(names);
    const pairs = [];
    for (const qual of OBJECT_QUALS) {
      for (const base of OBJECT_BASES) {
        const n = `${qual} ${base}`;
        if (!used.has(n)) pairs.push(n);
      }
    }
    const n = pairs.length;
    for (let i = 0; names.length < 600; i++) {
      const name = pairs[(i * 137) % n];
      if (used.has(name)) continue;
      used.add(name);
      names.push(name);
    }
    return names;
  }
  const OBJ_NAMES = objectNames();
  const OBJECTS600 = Array.from({ length: 600 }, (_, i) => {
    const rank = i + 1;
    const total = Math.max(1, Math.round(195 / Math.pow(rank, 0.5)));
    const l2 = Math.round(total * (0.2 * Math.exp(-rank / 120) + 0.03));
    const l3 = Math.round(total * (0.08 * Math.exp(-rank / 80) + 0.006));
    return { rank, name: OBJ_NAMES[i], total, tiers: { L1: total - l2 - l3, L2: l2, L3: l3 } };
  });

  const ZONES = [
    { label: 'Residential', hours: 4520.7, tiers: [3478.5, 866.7, 175.5], color: '#1f5f96',
      scenes: 'kitchen · living room · dining room · storage room · bathroom · bedroom · study · laundry area · balcony' },
    { label: 'Commercial', hours: 2588.1, tiers: [2142.0, 383.7, 62.4], color: '#24707c',
      scenes: 'retail store · logistics facility · entertainment venue · restaurant · beverage shop · pet shop · hotel · performance venue · hair salon · beauty salon' },
    { label: 'Professional', hours: 1982.3, tiers: [1558.8, 227.1, 196.5], color: '#6a4c9c',
      scenes: 'office · classroom · laboratory · healthcare facility · conference centre' },
    { label: 'Industrial', hours: 1956.7, tiers: [1470.1, 421.1, 65.5], color: '#8a6136',
      scenes: 'factory workshop · workroom · industrial warehouse · construction site · equipment room · testing laboratory' },
    { label: 'Public', hours: 1210.6, tiers: [1173.3, 37.4, 0], color: '#4f6272',
      scenes: 'park & garden · public facility · street · farm · indoor sports venue · sports area · transportation' },
    { label: 'Other', hours: 241.6, tiers: [177.5, 64.1, 0], color: '#a8b8c4', scenes: 'residual class' },
  ];
  const TIER_FILL = { L1: '#1f5f96', L2: '#0f6f68', L3: '#6a4c9c' };

  /* top scene photos by hours (assets/scenes/*.jpg) — 8 tiles */
  const SCENE_GALLERY = [
    ['kitchen', 'kitchen', 1174.8], ['factory_workshop', 'factory workshop', 1168.2],
    ['office', 'office', 1128.6], ['living_room', 'living room', 802.2],
    ['dining_room', 'dining room', 649.9], ['storage_room', 'storage room', 601.2],
    ['workroom', 'workroom', 563.2], ['retail_store', 'retail store', 545.1],
  ];

  function buildDist() {
    const root = el('div');
    const head = el('div', 'head');
    head.innerHTML = `<div class="kicker">06 <span class="dot">·</span> DISTRIBUTIONS</div>
      <h2>Not one kind of room.</h2>`;
    root.appendChild(head);

    /* ---- shot A: the zones, stacked by tier (page Fig. 2a/b) + photos ---- */
    const shotA = el('div', 'shot');
    const topA = el('div', 'disttop');
    topA.innerHTML = `<div><div class="h">38 scene classes · 5 zones + residual</div></div>
      <div class="s">hours by zone · stacked by tier · 12,500 h</div>`;
    const zoneBox = el('div', 'dszones');
    const zoneRows = ZONES.map((z, i) => {
      const total = z.tiers[0] + z.tiers[1] + z.tiers[2];
      const pct = total / 12500 * 100;
      const row = el('div', 'zrow');
      row.innerHTML = `
        <div class="zrow-head"><span class="nm">${z.label}</span><span class="hr">${(total / 1000).toFixed(1)}k h · ${pct.toFixed(1)}%</span></div>
        <div class="zrow-bar">${['L1', 'L2', 'L3'].map((k, j) =>
          `<i style="width:${(z.tiers[j] / total * 100).toFixed(1)}%;background:${TIER_FILL[k]}"></i>`).join('')}</div>
        <div class="zrow-scenes">${z.scenes}</div>`;
      zoneBox.appendChild(row);
      return { row, segs: [...row.querySelectorAll('.zrow-bar i')] };
    });
    const gal = el('div', 'dsgal');
    const tiles = SCENE_GALLERY.map(([file, label, hours]) => {
      const tile = el('div', 'dsgt');
      tile.innerHTML = `<img src="assets/scenes/${file}.jpg" alt=""><div class="cap"><b>${label}</b><span>${Math.round(hours)} h</span></div>`;
      gal.appendChild(tile);
      return tile;
    });
    const gridA = el('div', 'dsA-grid');
    gridA.append(zoneBox, gal);
    shotA.append(topA, gridA);
    root.appendChild(shotA);

    /* ---- shot B: the page's Fig. 2c/d — 99 verbs and 635 objects, ranked ---- */
    const shotB = el('div', 'shot');
    shotB.innerHTML = `
      <div class="dsB2">
        <div class="dsb2-col verbs">
          <div class="dsb-head"><b>99</b> task verbs</div>
          <canvas id="verbchart"></canvas>
          <div class="dsb-cap">ranked by frequency · stacked by the tier that records them</div>
          <div class="dsb-names">pick · place · pour · wipe · tighten · chop · open · close · lift · hold</div>
        </div>
        <div class="dsb2-col objs">
          <div class="dsb-head"><b>635</b> object classes</div>
          <canvas id="objchart"></canvas>
          <div class="dsb-cap">600 entries · rank 1 holds 195 instances · the tail runs to a handful</div>
        </div>
      </div>`;
    root.appendChild(shotB);

    /* verb chart: 80 bars stacked by tier */
    const verbCv = shotB.querySelector('#verbchart');
    const VW = 780, VH = 340;
    verbCv.width = VW * 2; verbCv.height = VH * 2;
    const vctx = verbCv.getContext('2d');
    const vMax = 80;
    function drawVerbChart(frac) {
      vctx.setTransform(1, 0, 0, 1, 0, 0);
      vctx.scale(2, 2);
      vctx.clearRect(0, 0, VW, VH);
      const X0 = 42, X1 = VW - 10, Y0 = 16, Y1 = VH - 66;
      const plotW = X1 - X0, plotH = Y1 - Y0;
      // grid + y labels
      vctx.font = '11px Mono, monospace';
      for (let v = 0; v <= vMax; v += 20) {
        const y = Y1 - (v / vMax) * plotH;
        vctx.strokeStyle = v === 0 ? '#b6c8d6' : '#e8eff4';
        vctx.lineWidth = 1;
        vctx.beginPath(); vctx.moveTo(X0, y); vctx.lineTo(X1, y); vctx.stroke();
        vctx.fillStyle = '#5b6c79';
        vctx.fillText(String(v), 8, y + 4);
      }
      // rank ticks
      [1, 20, 40, 60, 80].forEach(rk => {
        const x = X0 + ((rk - 0.5) / 80) * plotW;
        vctx.fillStyle = '#5b6c79';
        vctx.fillText(String(rk), x - 6, Y1 + 16);
      });
      vctx.fillStyle = '#5b6c79';
      vctx.fillText('rank', X1 - 26, Y1 + 30);
      // bars (stacked L1/L2/L3), revealed left to right
      const bw = plotW / 80;
      const cut = X0 + plotW * frac;
      vctx.save();
      vctx.beginPath(); vctx.rect(X0, Y0 - 4, Math.max(0, cut - X0), plotH + 8); vctx.clip();
      VERBS80.forEach((v, i) => {
        let acc = 0;
        ['L1', 'L2', 'L3'].forEach(k => {
          const val = v.tiers[k];
          const h = (val / vMax) * plotH;
          const y = Y1 - ((acc + val) / vMax) * plotH;
          vctx.fillStyle = TIER_FILL[k];
          vctx.fillRect(X0 + i * bw + 0.5, y, Math.max(0.8, bw - 1), h);
          acc += val;
        });
      });
      vctx.restore();
      // top-10 bracket
      const bx1 = X0, bx2 = X0 + 10 * bw;
      vctx.strokeStyle = '#14202b';
      vctx.lineWidth = 1.2;
      vctx.beginPath();
      vctx.moveTo(bx1, Y0 - 6); vctx.lineTo(bx2, Y0 - 6);
      vctx.moveTo(bx1, Y0 - 6); vctx.lineTo(bx1, Y0 - 1);
      vctx.moveTo(bx2, Y0 - 6); vctx.lineTo(bx2, Y0 - 1);
      vctx.stroke();
      vctx.fillStyle = '#14202b';
      vctx.font = '11px Mono, monospace';
      vctx.fillText('top 10 · 46%', bx1 + 4, Y0 - 12);
    }

    /* object chart: 600 bars stacked by tier, the silhouette of the tail */
    const objCv = shotB.querySelector('#objchart');
    const OW = 924, OH = 340;
    objCv.width = OW * 2; objCv.height = OH * 2;
    const octx = objCv.getContext('2d');
    const objTotal = OBJECTS600.reduce((n, o) => n + o.total, 0);
    const objTop20 = OBJECTS600.slice(0, 20).reduce((n, o) => n + o.total, 0);
    const objTopShare = Math.round(objTop20 / objTotal * 100);
    function drawObjChart(frac) {
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.scale(2, 2);
      octx.clearRect(0, 0, OW, OH);
      const X0 = 44, X1 = OW - 12, Y0 = 16, Y1 = OH - 44;
      const plotW = X1 - X0, plotH = Y1 - Y0;
      const oMax = 200;
      octx.font = '11px Mono, monospace';
      for (let v = 0; v <= oMax; v += 50) {
        const y = Y1 - (v / oMax) * plotH;
        octx.strokeStyle = v === 0 ? '#b6c8d6' : '#e8eff4';
        octx.lineWidth = 1;
        octx.beginPath(); octx.moveTo(X0, y); octx.lineTo(X1, y); octx.stroke();
        octx.fillStyle = '#5b6c79';
        octx.fillText(String(v), 8, y + 4);
      }
      [1, 100, 200, 300, 500, 600].forEach(rk => {
        const x = X0 + (rk / 600) * plotW;
        octx.fillStyle = '#5b6c79';
        octx.fillText(String(rk), x - 8, Y1 + 16);
      });
      octx.fillStyle = '#5b6c79';
      octx.fillText('rank', X1 - 26, Y1 + 30);
      const bw = plotW / 600;
      const cut = X0 + plotW * frac;
      octx.save();
      octx.beginPath(); octx.rect(X0, Y0 - 4, Math.max(0, cut - X0), plotH + 8); octx.clip();
      OBJECTS600.forEach((o, i) => {
        let acc = 0;
        ['L1', 'L2', 'L3'].forEach(k => {
          const val = o.tiers[k];
          const h = (val / oMax) * plotH;
          const y = Y1 - ((acc + val) / oMax) * plotH;
          octx.fillStyle = TIER_FILL[k];
          octx.fillRect(X0 + i * bw, y, Math.max(0.6, bw - 0.25), h);
          acc += val;
        });
      });
      octx.restore();
      // top-20 bracket
      const bx2 = X0 + 20 * bw;
      octx.strokeStyle = '#14202b';
      octx.lineWidth = 1.2;
      octx.beginPath();
      octx.moveTo(X0, Y0 - 6); octx.lineTo(bx2, Y0 - 6);
      octx.moveTo(X0, Y0 - 6); octx.lineTo(X0, Y0 - 1);
      octx.moveTo(bx2, Y0 - 6); octx.lineTo(bx2, Y0 - 1);
      octx.stroke();
      octx.fillStyle = '#14202b';
      octx.fillText(`top 20 · ${objTopShare}%`, X0 + 4, Y0 - 12);
    }
    drawVerbChart(0);
    drawObjChart(0);

    // ---- shot C: hours split + zones + staging ----
    const zoneVals = [
      ['residential', 4520.7, 36.2, '#1f5f96'], ['commercial', 2588.1, 20.7, '#24707c'],
      ['professional', 1982.3, 15.9, '#6a4c9c'], ['industrial', 1956.7, 15.7, '#8a6136'],
      ['public', 1210.6, 9.7, '#4f6272'], ['other', 241.6, 1.9, '#a8b8c4'],
    ];
    const zoneHtml = zoneVals.map(([name, hrs, pct, col]) => `
      <div style="display:flex;align-items:center;gap:14px;height:27px;font-size:16px;color:var(--body)">
        <span style="width:118px;text-transform:capitalize">${name}</span>
        <span style="flex:1;height:8px;background:var(--paper-2);position:relative"><i style="position:absolute;inset:0 auto 0 0;width:${pct / 36.2 * 100}%;background:${col}"></i></span>
        <span style="width:54px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--soft)">${pct}%</span>
        <span style="width:74px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--mute)">${hrs.toLocaleString('en-US')} h</span>
      </div>`).join('');
    const shotC = el('div', 'shot');
    shotC.innerHTML = `
      <div class="dsC-head">A long tail, deliberately kept.</div>
      <div style="display:flex;gap:90px;margin-top:26px">
        <div style="width:900px">
          <div class="kicker" style="margin-bottom:14px">recorded hours · 12,500 h by tier</div>
          <div class="splitbar" style="height:56px">
            <div class="seg" style="width:80%;background:#1f5f96"><span>L1 · 10,000 h</span></div>
            <div class="seg" style="width:16%;background:#0f6f68"><span>L2 · 2,000</span></div>
            <div class="seg" style="width:4%;background:#6a4c9c"></div>
          </div>
          <div class="kicker" style="margin:30px 0 12px">share by zone</div>
          ${zoneHtml}
          <div class="kicker" style="margin:28px 0 6px">mean episode length</div>
          <div style="font-size:20px;color:var(--body)">
            <div style="display:flex;align-items:center;gap:16px;height:34px"><span style="width:36px;font-family:var(--mono)">L1</span><span style="flex:1;height:10px;background:var(--paper-2);position:relative"><i id="len1" style="position:absolute;inset:0;background:#1f5f96;transform-origin:0 50%;transform:scaleX(0)"></i></span><span style="width:70px;text-align:right;font-family:var(--mono)">101 s</span></div>
            <div style="display:flex;align-items:center;gap:16px;height:34px"><span style="width:36px;font-family:var(--mono)">L2</span><span style="flex:1;height:10px;background:var(--paper-2);position:relative"><i id="len2" style="position:absolute;inset:0;background:#0f6f68;transform-origin:0 50%;transform:scaleX(0)"></i></span><span style="width:70px;text-align:right;font-family:var(--mono)">65 s</span></div>
            <div style="display:flex;align-items:center;gap:16px;height:34px"><span style="width:36px;font-family:var(--mono)">L3</span><span style="flex:1;height:10px;background:var(--paper-2);position:relative"><i id="len3" style="position:absolute;inset:0;background:#6a4c9c;transform-origin:0 50%;transform:scaleX(0)"></i></span><span style="width:70px;text-align:right;font-family:var(--mono)">60 s</span></div>
          </div>
        </div>
        <div style="width:700px">
          <div class="kicker" style="margin-bottom:14px">L3 · staging</div>
          <div class="splitbar" style="height:56px">
            <div class="seg" style="width:70%;background:#6a4c9c"><span>controlled · 70%</span></div>
            <div class="seg" style="width:30%;background:#c8d7e3"><span style="color:#2b3a47">open · 30%</span></div>
          </div>
          <div style="margin-top:20px;font-size:18px;line-height:1.6;color:var(--soft);max-width:680px">
            The deeper the tier, the more controlled the staging. Controlled L3 supplies the direct
            measurements: gaze, hand pose and finger kinematics, on the same clock as the video.
          </div>
          <div style="margin-top:34px;display:flex;gap:0;border-top:1px solid var(--line-2)">
            <div style="flex:1;padding:18px 20px 0 0"><div style="font-family:var(--display);font-size:42px;letter-spacing:-.03em">12,500</div><div style="font-size:16px;color:var(--soft)">hours, total</div></div>
            <div style="flex:1;padding:18px 20px 0 20px;border-left:1px solid var(--line)"><div style="font-family:var(--display);font-size:42px;letter-spacing:-.03em">38</div><div style="font-size:16px;color:var(--soft)">scene classes</div></div>
            <div style="flex:1;padding:18px 0 0 20px;border-left:1px solid var(--line)"><div style="font-family:var(--display);font-size:42px;letter-spacing:-.03em">6</div><div style="font-size:16px;color:var(--soft)">collection sites</div></div>
          </div>
        </div>
      </div>`;
    root.appendChild(shotC);

    const b = beat('dist');
    const s = b ? b.start : 180;
    const tB = cue('verbs');
    const tC = cue('tail');

    function render(t) {
      const hp = out(seg(t, s - 0.35, s + 0.5));
      head.style.opacity = hp;
      head.style.transform = `translateY(${(1 - hp) * 16}px)`;
      const showA = t < tB - 0.2;
      const showB = t >= tB - 0.2 && t < tC - 0.2;
      const showC = t >= tC - 0.2;
      shotA.style.display = showA ? 'block' : 'none';
      shotB.style.display = showB ? 'block' : 'none';
      shotC.style.display = showC ? 'block' : 'none';
      if (showA) {
        const zp = out(seg(t, cue('zones') - 0.2, cue('zones') + 1.4));
        zoneRows.forEach(({ row }, i) => {
          const p = out(seg(t, cue('zones') + i * 0.12, cue('zones') + 0.6 + i * 0.12));
          row.style.opacity = 0.12 + 0.88 * p;
          row.style.transform = `translateY(${(1 - p) * 10}px)`;
          row.querySelector('.zrow-bar').style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
        });
        topA.style.opacity = out(seg(t, cue('zones') - 0.4, cue('zones') + 0.4));
        zoneBox.style.opacity = 0.3 + 0.7 * zp;
        tiles.forEach((tile, i) => {
          const p = out(seg(t, cue('zones') + 0.3 + i * 0.06, cue('zones') + 0.8 + i * 0.06));
          tile.style.opacity = p;
          tile.style.transform = `scale(${0.94 + 0.06 * p})`;
        });
      }
      if (showB) {
        const p = out(seg(t, tB, tB + 0.7));
        shotB.style.opacity = p;
        shotB.style.transform = `translateY(${(1 - p) * 12}px)`;
        drawVerbChart(out(seg(t, tB + 0.25, tB + 1.5)));
        drawObjChart(out(seg(t, tB + 0.45, tB + 1.9)));
      }
      if (showC) {
        const p = out(seg(t, tC, tC + 0.8));
        shotC.style.opacity = p;
        shotC.style.transform = `translateY(${(1 - p) * 12}px)`;
        const cp = seg(t, cue('ctrl') - 0.3, cue('ctrl') + 0.9);
        const l1 = shotC.querySelector('#len1'), l2 = shotC.querySelector('#len2'), l3 = shotC.querySelector('#len3');
        if (l1) {
          l1.style.transform = `scaleX(${out(seg(t, tC + 0.4, tC + 1.4)) * 101 / 101})`;
          l2.style.transform = `scaleX(${out(seg(t, tC + 0.5, tC + 1.5)) * 65 / 101})`;
          l3.style.transform = `scaleX(${out(seg(t, tC + 0.6, tC + 1.6)) * 60 / 101})`;
        }
      }
    }
    return { el: root, render };
  }

  /* ============================================================
     09 · FORMAT — the write/read cycle, after the project page
     ============================================================ */
  const FM_LANES = [
    { id: 'eye_gaze', rate: '200 Hz', rows: 1, mode: 'nearest', color: '#0f6f68', how: 'nearest sample' },
    { id: 'hand_pose', rate: '800 Hz', rows: 1, mode: 'interp', color: '#8a6136', how: 'linear interpolation' },
    { id: 'wrist_emg', rate: '2000 Hz', rows: 67, mode: 'window', color: '#1f5f96', how: 'window (-33 ms, 0]' },
    { id: 'eeg', rate: '1000 Hz', rows: 33, mode: 'window', color: '#6a4c9c', how: 'window (-33 ms, 0]' },
  ];

  function buildFormat() {
    const root = el('div');
    root.innerHTML = `
      <div class="head">
        <div class="kicker">07 <span class="dot">·</span> THE FORMAT</div>
        <h2>Asynchronous by design.</h2>
        <p class="lead">Never resampled. Aligned at query time.</p>
      </div>
      <div class="fm-board">
        <div class="fm-tree">
          <div><b>episode_000000/</b></div>
          <div class="dim">&nbsp;├─ meta/ &nbsp; info.json · stats</div>
          <div>&nbsp;├─ <b>videos/</b> &nbsp; headband_left_rgb</div>
          <div class="dim">&nbsp;│ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; wrist_right_rgb ...</div>
          <div>&nbsp;├─ <b>calibrations/</b> &nbsp; intrinsics</div>
          <div>&nbsp;├─ <b>annotation/</b> &nbsp; steps · qc</div>
          <div>&nbsp;└─ <b>parquet/</b></div>
          <div class="hl">&nbsp;&nbsp;&nbsp;&nbsp;eeg.parquet &nbsp;&nbsp;[132]</div>
          <div class="hl">&nbsp;&nbsp;&nbsp;&nbsp;left_wrist_emg.parquet &nbsp;[8]</div>
          <div class="hl">&nbsp;&nbsp;&nbsp;&nbsp;eye_gaze.parquet &nbsp;[2]</div>
          <div class="hl">&nbsp;&nbsp;&nbsp;&nbsp;hand_pose.parquet &nbsp;[40]</div>
          <div class="dim">&nbsp;&nbsp;&nbsp;&nbsp;... 23 tables</div>
        </div>

        <div class="fm-center">
          <div class="fm-rail">
            <div class="fm-railcap">MASTER INDEX · 30 FPS · ONE ROW PER FRAME</div>
            <div class="fm-ruler" id="fmruler"></div>
            <div class="fm-cursor" id="fmcursor"></div>
          </div>
          <div class="fm-lanes" id="fmlanes"></div>
          <div class="fm-read" id="fmread"></div>
        </div>

        <div class="fm-tables">
          <div class="cap">23 signal tables · one parquet per stream</div>
          <div class="grid" id="fmtablegrid"></div>
        </div>
      </div>
      <div class="fm-declare">The data <b>declares</b> its alignment. It does not bake it in.</div>`;

    const ruler = root.querySelector('#fmruler');
    const cursor = root.querySelector('#fmcursor');
    const lanesBox = root.querySelector('#fmlanes');
    const readBox = root.querySelector('#fmread');
    const grid = root.querySelector('#fmtablegrid');
    const tables = [
      ['eeg_raw', 132], ['eeg', 132], ['eye_gaze', 2], ['head_pose', 6], ['hand_pose', 40],
      ['hand_skeleton', 300], ['left_wrist_emg', 8], ['right_wrist_emg', 8], ['left_wrist_pose', 6],
      ['right_wrist_pose', 6], ['headband_imu0', 6], ['marker', 1], ['state', 58], ['left_wrist_imu', 6],
      ['right_wrist_imu', 6], ['hand_left_points', 63], ['hand_right_points', 63], ['eeg_impedance', 136],
      ['eye_imu', 6], ['left_wrist_emg_raw', 8], ['right_wrist_emg_raw', 8], ['headband_microphone', 320],
      ['eeg_repair', 132],
    ];
    tables.forEach(([n, d]) => {
      const t2 = el('div', 't', `${n}<span>[${d}]</span>`);
      grid.appendChild(t2);
    });

    /* master clock: frames n−4 … n+2, 33.3 ms apart */
    const SPAN_MS = 200, X0 = 0, X1 = 700;
    const FRAME_MS = [-4, -3, -2, -1, 0, 1, 2].map(i => 100 + i * 33.33);
    FRAME_MS.forEach((ms, i) => {
      const x = X0 + (ms / SPAN_MS) * (X1 - X0);
      const tick = el('i', 'fm-tick');
      tick.style.left = x + 'px';
      ruler.appendChild(tick);
      const lab = el('div', 'fm-tlab', i === 4 ? 'n' : i === 3 ? 'n-1' : i === 2 ? 'n-2' : i === 5 ? 'n+1' : i === 6 ? 'n+2' : `n${i - 4}`);
      lab.style.left = x + 'px';
      ruler.appendChild(lab);
    });

    const lanes = FM_LANES.map(l => {
      const box = el('div', 'fm-lane');
      box.dataset.mode = l.mode;
      box.innerHTML = `<div class="fm-lname">${l.id}</div><div class="fm-lrate">${l.rate}</div>
        <canvas class="fm-lc"></canvas>
        <div class="fm-lhow">${l.how}</div>
        <div class="fm-lrows">${l.rows} row${l.rows > 1 ? 's' : ''}</div>`;
      lanesBox.appendChild(box);
      const cv = box.querySelector('.fm-lc');
      cv.width = 700 * 2; cv.height = 64 * 2;
      cv.style.width = '700px'; cv.style.height = '64px';
      const ctx = cv.getContext('2d');
      ctx.scale(2, 2);
      const hz = parseInt(l.rate, 10);
      const samples = [];
      for (let i = 0; ; i++) {
        const ms = i * 1000 / hz;
        if (ms > SPAN_MS) break;
        samples.push(ms);
      }
      return { l, box, cv, ctx, samples, x: ms => X0 + (ms / SPAN_MS) * (X1 - X0) };
    });
    readBox.innerHTML = FM_LANES.map(l => `
      <div class="fm-rrow" data-r="${l.id}"><b>${l.id}</b><span>${l.mode === 'nearest' ? 'nearest sample' : l.mode === 'interp' ? 'linear interpolation' : `all samples in (-33 ms, 0]`}</span><em>${l.rows} row${l.rows > 1 ? 's' : ''} at frame n</em></div>`).join('');

    const b = beat('format');
    const s = b ? b.start : 210;
    const queryX = lanes[0].x(100);

    function render(t) {
      const hp = out(seg(t, s - 0.35, s + 0.5));
      root.querySelector('.head').style.opacity = hp;
      root.querySelector('.head').style.transform = `translateY(${(1 - hp) * 16}px)`;
      const tree = root.querySelector('.fm-tree');
      const tablesEl = root.querySelector('.fm-tables');
      const center = root.querySelector('.fm-center');
      const tp = out(seg(t, s - 0.1, s + 0.8));
      tree.style.opacity = tp;
      tree.style.transform = `translateX(${(1 - tp) * -14}px)`;
      const tabp = out(seg(t, cue('tables') - 0.2, cue('tables') + 0.7));
      tablesEl.style.opacity = 0.5 + 0.5 * tabp;
      tablesEl.style.transform = `translateX(${(1 - tabp) * 14}px)`;
      [...grid.children].forEach((c, i) => {
        c.style.opacity = 0.4 + 0.6 * out(seg(t, cue('tables') + i * 0.012, cue('tables') + 0.5 + i * 0.012));
      });

      // write phase: each stream stamps its samples on its own grid
      const wp = out(seg(t, cue('async') - 0.2, cue('async') + 1.6));
      center.style.opacity = 0.5 + 0.5 * wp;
      lanes.forEach(({ l, ctx, samples, x }) => {
        ctx.clearRect(0, 0, 700, 64);
        ctx.strokeStyle = '#c8d7e3';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 32); ctx.lineTo(700, 32);
        ctx.stroke();
        const stamped = wp * SPAN_MS;
        ctx.strokeStyle = l.color;
        for (const ms of samples) {
          const p = ms <= stamped ? 0.8 : 0.14;
          if (p < 0.15) continue;
          ctx.globalAlpha = p;
          const xx = x(ms);
          ctx.beginPath();
          ctx.moveTo(xx, 26); ctx.lineTo(xx, 38);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // resolution marks at frame n
        const q = out(seg(t, cue('modes') + 0.15, cue('modes') + 0.9));
        if (l.mode === 'nearest') {
          ctx.strokeStyle = l.color;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(queryX, 32, 7, 0, Math.PI * 2);
          ctx.globalAlpha = q;
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (l.mode === 'interp') {
          const lo = samples.filter(ms => ms <= 100).pop() || 100;
          const hi = samples.find(ms => ms > 100) || 100;
          ctx.strokeStyle = l.color;
          ctx.lineWidth = 1.6;
          ctx.globalAlpha = q;
          ctx.beginPath();
          ctx.arc(x(lo), 32, 4.5, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath();
          ctx.arc(x(hi), 32, 4.5, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x(lo), 32); ctx.lineTo(queryX, 32); ctx.stroke();
          ctx.fillStyle = l.color;
          ctx.beginPath(); ctx.arc(queryX, 32, 3, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = l.color;
          ctx.globalAlpha = 0.12 * q;
          ctx.fillRect(queryX - 33.33 / SPAN_MS * 700, 22, 33.33 / SPAN_MS * 700, 20);
          ctx.globalAlpha = 1;
        }
      });

      // index: the query cursor sweeps to frame n
      const ip = out(seg(t, cue('index') - 0.2, cue('index') + 1.1));
      cursor.style.left = (X0 + (queryX - X0) * ip) + 'px';
      cursor.style.opacity = 0.35 + 0.65 * ip;
      root.querySelectorAll('.fm-tick').forEach((tk, i) => {
        tk.style.opacity = 0.25 + 0.75 * (ip >= 0.95 || FRAME_MS[i] <= 100 ? 1 : 0);
      });

      // modes: rows resolve one by one
      root.querySelectorAll('.fm-rrow').forEach((r, i) => {
        const p = out(seg(t, cue('modes') + i * 0.1, cue('modes') + 0.5 + i * 0.1));
        r.style.opacity = 0.25 + 0.75 * p;
        r.style.transform = `translateX(${(1 - p) * 10}px)`;
      });
      const dp = out(seg(t, cue('declare') - 0.2, cue('declare') + 0.7));
      root.querySelector('.fm-declare').style.opacity = dp;
      root.querySelector('.fm-declare').style.transform = `translateY(${(1 - dp) * 12}px)`;
    }
    return { el: root, render };
  }

  /* ============================================================
     10 · COMMUNITY
     ============================================================ */
  function buildCommunity() {
    const root = el('div');
    const logos = window.LOGOS || [];
    root.innerHTML = `
      <div class="head">
        <div class="kicker">08 <span class="dot">·</span> COMMUNITY</div>
        <h2>An open ecosystem.</h2>
      </div>
      <div class="cm-leadline">Led by <span>BAAI</span>,<br>with 27 institutions.</div>
      <div class="cm-bignum">
        <div class="stat"><b>6</b><span>recording<br>sites</span></div>
        <div class="stat"><b>27</b><span>institutions</span></div>
        <div class="stat"><b>1</b><span>task<br>ontology</span></div>
      </div>
      <div class="cm-wall" id="cmwall"></div>`;
    const wall = root.querySelector('#cmwall');
    logos.slice(0, 32).forEach((l, i) => {
      const d = el('div', 'logo');
      const img = new Image(); img.src = l; img.alt = '';
      d.appendChild(img);
      wall.appendChild(d);
    });
    const b = beat('community');
    const s = b ? b.start : 235;
    const items = [...wall.children];

    function render(t) {
      const hp = out(seg(t, s - 0.35, s + 0.5));
      root.querySelector('.head').style.opacity = hp;
      root.querySelector('.head').style.transform = `translateY(${(1 - hp) * 16}px)`;
      const lp = out(seg(t, cue('logos') - 0.3, cue('logos') + 0.8));
      root.querySelector('.cm-leadline').style.opacity = lp;
      root.querySelector('.cm-leadline').style.transform = `translateY(${(1 - lp) * 16}px)`;
      const np = out(seg(t, cue('count'), cue('count') + 0.6));
      root.querySelector('.cm-bignum').style.opacity = np;
      items.forEach((it, i) => {
        const p = out(seg(t, cue('logos') + 0.1 + i * 0.045, cue('logos') + 0.7 + i * 0.045));
        it.style.opacity = p;
        it.style.transform = `translateY(${(1 - p) * 14}px)`;
      });
    }
    return { el: root, render };
  }

  /* ============================================================
     11 · OUTRO — the open tool, the data manager, one command
     ============================================================ */
  function buildOutro() {
    const root = el('div');
    root.innerHTML = `
      <div class="word">HumanCOIN</div>
      <div class="ot-slogan">The intent<br>behind the action.</div>
      <div class="ot-authors">Shihan Wu &nbsp;·&nbsp; You Liu &nbsp;·&nbsp; Minghui Qin &nbsp;·&nbsp; Longhan Jiao &nbsp;·&nbsp; Jinbang Guo<br>Shaoxuan Xie &nbsp;·&nbsp; Zhongyuan Wang &nbsp;·&nbsp; Guocai Yao &nbsp;·&nbsp; et al.</div>
      <div class="ot-term">
        <div class="ot-bar"><i></i><i></i><i></i><span>bash</span></div>
        <div class="ot-line"><span class="ot-prompt">$</span><span class="ot-cmd" id="otcmd"></span><span class="ot-caret" id="otcaret"></span></div>
        <div class="ot-out" id="otout">&gt; HumanCOIN ready — one episode to begin</div>
      </div>

      <div class="ot-win">
        <div class="ot-winbar">
          <i></i><i></i><i></i>
          <span>flagopen.github.io/HumanCOIN-DataManager</span>
        </div>
        <div class="ot-winbody">
          <img id="otshot" src="assets/datamanager-long.jpg" alt="HumanCOIN DataManager">
          <svg class="ot-cursor" id="otcursor" viewBox="0 0 16 16"><path d="M2 1 L14 7.5 L2 14 Z" fill="#fff" stroke="#14202b" stroke-width="1.2"/></svg>
          <div class="ot-scrollbar" id="otscroll"></div>
          <div class="ot-chip c1">query any frame</div>
          <div class="ot-chip c2">every modality · one clock</div>
          <div class="ot-chip c3">open browser</div>
        </div>
      </div>

      <div class="ot-links">
        <div class="link"><div class="k">Project page</div><div class="v">flagopen.github.io/HumanCOIN</div></div>
        <div class="link"><div class="k">Data manager</div><div class="v">flagopen.github.io/HumanCOIN-DataManager</div></div>
        <div class="link"><div class="k">Report</div><div class="v">arXiv 2611.26434</div></div>
      </div>
      <div class="welcome">Welcome.</div>
      <img class="baai" src="assets/logos/baai.png" alt="">
      <div class="fine">BAAI · AhaData Group · CC BY-NC 4.0</div>`;
    const b = beat('outro');
    const s = b ? b.start : 250;
    const word = root.querySelector('.word');
    const slogan = root.querySelector('.ot-slogan');
    const authors = root.querySelector('.ot-authors');
    const term = root.querySelector('.ot-term');
    const cmd = root.querySelector('#otcmd');
    const caret = root.querySelector('#otcaret');
    const outEl = root.querySelector('#otout');
    const win = root.querySelector('.ot-win');
    const shot = root.querySelector('#otshot');
    const cursor = root.querySelector('#otcursor');
    const scrollbar = root.querySelector('#otscroll');
    const chips = [...root.querySelectorAll('.ot-chip')];
    const links = [...root.querySelectorAll('.ot-links .link')];
    const welcome = root.querySelector('.welcome');
    const CMD = 'pip install humancoin';
    const typeStart = cue('command') + 0.12;
    const charT = 0.055;
    const end = b ? b.scene_end : s + 12;

    function render(t) {
      const wp = out(seg(t, s - 0.35, s + 0.8));
      word.style.opacity = wp;
      word.style.transform = `translateY(${(1 - wp) * 22}px)`;
      const sp = out(seg(t, s + 0.2, s + 0.9));
      slogan.style.opacity = sp;
      slogan.style.transform = `translateY(${(1 - sp) * 14}px)`;
      authors.style.opacity = out(seg(t, s + 0.5, s + 1.2));
      authors.style.transform = `translateY(${(1 - out(seg(t, s + 0.5, s + 1.2))) * 10}px)`;

      // the data manager: a live-looking window scrolling through the release page
      const wp2 = out(seg(t, s + 0.25, s + 0.95));
      win.style.opacity = wp2;
      win.style.transform = `translateY(${(1 - wp2) * 26}px) scale(${0.96 + 0.04 * wp2})`;
      const pan = inOut(seg(t, s + 0.7, end - 0.7));
      shot.style.transform = `translateY(${-pan * 1964}px)`;
      cursor.style.left = (150 + Math.sin(pan * 6.3) * 60) + 'px';
      cursor.style.top = (110 + pan * 300) + 'px';
      cursor.style.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.1));
      // a scrollbar thumb on the right edge of the window
      scrollbar.style.height = '72px';
      scrollbar.style.top = (8 + pan * (484 - 88)) + 'px';
      chips.forEach((ch, i) => {
        const p = out(seg(t, s + 2.0 + i * 0.9, s + 2.5 + i * 0.9));
        ch.style.opacity = p;
        ch.style.transform = `translateY(${(1 - p) * 8}px)`;
      });

      const tp = out(seg(t, typeStart - 0.5, typeStart + 0.1));
      term.style.opacity = tp;
      term.style.transform = `translateY(${(1 - tp) * 12}px)`;
      const n = Math.max(0, Math.min(CMD.length, Math.floor((t - typeStart) / charT)));
      cmd.textContent = CMD.slice(0, n);
      const typing = t < typeStart + CMD.length * charT + 0.15;
      caret.style.opacity = tp * (typing ? 1 : (Math.sin(t * 5) > 0 ? 1 : 0.15));
      const op = out(seg(t, typeStart + CMD.length * charT + 0.45, typeStart + CMD.length * charT + 0.85));
      outEl.style.opacity = op;
      outEl.style.transform = `translateY(${(1 - op) * 4}px)`;

      links.forEach((l, i) => {
        const p = out(seg(t, cue('links') - 0.35 + i * 0.14, cue('links') + 0.25 + i * 0.14));
        l.style.opacity = p;
        l.style.transform = `translateY(${(1 - p) * 10}px)`;
      });
      const wl = out(seg(t, cue('welcome') - 0.15, cue('welcome') + 0.6));
      welcome.style.opacity = wl;
      welcome.style.transform = `translateY(${(1 - wl) * 12}px)`;
    }
    return { el: root, render };
  }

  /* ============================================================
     boot
     ============================================================ */
  const logoSrcs = ['ant', 'baai', 'beihang', 'boden', 'damon', 'feiyuxing', 'fudan', 'guanglun', 'huazhi', 'ioai',
    'jdcloud', 'jianzhi', 'jiazi', 'jijia', 'lingmei', 'lingsheng', 'maiqing', 'mifeng', 'octopus', 'pku',
    'purity', 'qiyi', 'quanyu', 'shutu', 'tashi', 'thu', 'ustc', 'wujie', 'zhiyu', 'zhiyue'].map(n => `assets/logos/${n}.png`);
  window.LOGOS = logoSrcs;

  async function boot() {
    document.body.classList.toggle('render', RENDER);
    if (RENDER) captionBox.classList.add('on');   // burn the subtitles into the capture
    if (!window.THUMBS) window.THUMBS = [];

    const intro = buildIntro();
    addScene('intro', intro.el, intro.render, { t0: 0 });
    const gap = buildGap(); addScene('gap', gap.el, gap.render);
    const path = buildPathway();
    addScene('pathway', path.el, path.render, { t1: (beat('traces') || beat('pathway')).scene_end });
    const dataset = buildDataset(); addScene('dataset', dataset.el, dataset.render);
    const tiers = buildTiers(); addScene('tiers', tiers.el, tiers.render);
    const episode = buildEpisode(); addScene('episode', episode.el, episode.render);
    const dist = buildDist(); addScene('dist', dist.el, dist.render);
    const format = buildFormat(); addScene('format', format.el, format.render);
    const community = buildCommunity(); addScene('community', community.el, community.render);
    const outro = buildOutro(); addScene('outro', outro.el, outro.render);

    // audio
    const audio = new Audio(FILM.audio);
    audio.preload = 'auto';

    let t = 0;
    let playing = false;
    let last = 0;
    let started = false;

    let pendingRender = null;
    function paint(now) {
      let active = null;
      for (const s2 of SCENES) {
        const on = now >= s2.t0 - 0.001 && now < s2.t1 + 0.001;
        if (on) active = s2;
        s2.el.classList.toggle('on', on);
      }
      if (!active) {
        const lastScene = SCENES[SCENES.length - 1];
        if (now >= lastScene.t1) { lastScene.el.classList.add('on'); active = lastScene; }
      }
      if (active) pendingRender = active.render(now) || null;
      updateChrome(active ? active.id : '', now);
      updateCaptions(now);
    }

    function updateCaptions(now) {
      if (!captionBox.classList.contains('on')) return;
      const c = FILM.captions.find(c2 => now >= c2.t0 && now <= c2.t1);
      if (c) { if (captionBox.textContent !== c.text) captionBox.textContent = c.text; }
      else if (captionBox.textContent) captionBox.textContent = '';
      captionBox.classList.toggle('empty', !c);
    }

    function syncAudio() {
      if (!started) return;
      if (Math.abs(audio.currentTime - t) > 0.25) audio.currentTime = Math.min(t, audio.duration || t);
    }

    function loop(ts) {
      if (!last) last = ts;
      const dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      if (playing) {
        t += dt;
        if (t >= FILM.total) { t = FILM.total; setPlaying(false); }
        syncAudio();
      }
      paint(t);
      updateUI();
      requestAnimationFrame(loop);
    }

    // ---- UI wiring
    const ui = document.getElementById('ui');
    const playBtn = document.getElementById('play');
    const scrub = document.getElementById('scrub');
    const fill = document.getElementById('fill');
    const timeEl = document.getElementById('time');
    const marks = document.getElementById('marks');
    FILM.beats.forEach(b2 => {
      if (!b2.start) return;
      const i = document.createElement('i');
      i.style.left = (b2.scene_start / FILM.total) * 100 + '%';
      marks.appendChild(i);
    });

    function fmt(s2) {
      const m = Math.floor(s2 / 60), sec = Math.floor(s2 % 60);
      return `${m}:${String(sec).padStart(2, '0')}`;
    }
    timeEl.textContent = `0:00 / ${fmt(FILM.total)}`;

    function updateUI() {
      const p = Math.min(1, t / FILM.total);
      fill.style.width = (p * 100) + '%';
      timeEl.textContent = `${fmt(t)} / ${fmt(FILM.total)}`;
    }

    function setPlaying(v) {
      playing = v;
      playBtn.textContent = v ? '❙❙' : '▶';
      if (!v) ui.classList.add('show');
      if (v) {
        started = true;
        if (audio.src) {
          if (Math.abs(audio.currentTime - t) > 0.3) audio.currentTime = t;
          audio.play().catch(() => {});
        }
      } else {
        audio.pause();
        document.querySelectorAll('video').forEach(v => v.pause());
      }
    }

    function seek(to) {
      t = Math.max(0, Math.min(FILM.total, to));
      if (started) audio.currentTime = t;
      paint(t);
      updateUI();
    }

    const poster = document.getElementById('poster');
    const hint = document.getElementById('hint');
    let hideTimer = 0;
    function revealUI(hold = 2600) {
      ui.classList.add('show');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { if (playing) ui.classList.remove('show'); }, hold);
    }
    document.getElementById('startbtn').addEventListener('click', () => {
      poster.classList.add('hide');
      if (hint) hint.style.opacity = 0;
      seek(0);
      setPlaying(true);
      revealUI(3000);
    });
    addEventListener('mousemove', () => revealUI(2400));
    playBtn.addEventListener('click', (e) => { e.stopPropagation(); setPlaying(!playing); });
    let dragging = false;
    function scrubTo(e) {
      const r = scrub.getBoundingClientRect();
      const p = clamp((e.clientX - r.left) / r.width);
      seek(p * FILM.total);
    }
    scrub.addEventListener('pointerdown', e => { dragging = true; scrubTo(e); scrub.setPointerCapture(e.pointerId); });
    scrub.addEventListener('pointermove', e => { if (dragging) scrubTo(e); });
    scrub.addEventListener('pointerup', () => { dragging = false; });

    document.addEventListener('keydown', e => {
      if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
      if (e.key === 'ArrowRight') seek(t + 5);
      if (e.key === 'ArrowLeft') seek(t - 5);
      if (e.key.toLowerCase() === 'c') toggleCC();
      if (e.key.toLowerCase() === 'f') toggleFull();
    });

    function toggleCC() {
      captionBox.classList.toggle('on');
      const b2 = document.getElementById('cc');
      b2.style.opacity = captionBox.classList.contains('on') ? 1 : 0.45;
    }
    function toggleFull() {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
    document.getElementById('cc').addEventListener('click', toggleCC);
    document.getElementById('fs').addEventListener('click', toggleFull);

    function fit() {
      if (RENDER) { stage.style.setProperty('--s', 1); return; }
      const s2 = Math.min(innerWidth / W, innerHeight / H) * 0.96;
      stage.style.setProperty('--s', s2);
    }
    addEventListener('resize', fit);
    fit();

    // ---- render API for the capture pass
    window.__render = async (time) => {
      t = time;
      paint(time);
      updateUI();
      if (pendingRender) { try { await pendingRender; } catch (e) { /* ignore */ } }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    };
    window.__filmTotal = FILM.total;
    window.__paint = paint;
    window.__seek = seek;
    window.__setPlaying = setPlaying;
    window.__ready = true;

    // initial poster frame: the title, a beat after it lands
    t = RENDER ? 0.01 : 2.2;
    paint(t);
    updateUI();
    requestAnimationFrame(loop);

    // warm the videos
    requestAnimationFrame(() => {
      document.querySelectorAll('video').forEach(v => { v.load(); });
    });
  }

  boot().catch(err => {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend',
      `<pre style="position:fixed;inset:0;background:#fff;color:#900;padding:40px;z-index:999;font:14px monospace">${String(err && err.stack || err)}</pre>`);
  });
})();
