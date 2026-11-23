(() => {
  'use strict';
  const DATA = window.SHORT || { captions: [], beats: [], total: 60 };
  const vid = document.getElementById('vid');
  const ui = document.getElementById('ui');
  const playBin = document.getElementById('play');
  const bigplay = document.getElementById('bigplay');
  const scrub = document.getElementById('scrub');
  const fill = document.getElementById('fill');
  const timeEl = document.getElementById('time');
  const caps = document.getElementById('captions');
  const marks = document.getElementById('marks');

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const total = DATA.total || 60;

  // one tick per cut
  const cuts = DATA.beats.flatMap(b => b.shots.map(s => s.at));
  cuts.forEach(t => {
    const i = document.createElement('i');
    i.style.left = (t / total) * 100 + '%';
    marks.appendChild(i);
  });

  let hideTimer = 0;
  function showUI(hold = 2400) {
    ui.classList.remove('hide');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!vid.paused) ui.classList.add('hide');
    }, hold);
  }

  function captionAt(t) {
    return DATA.captions.find(c => t >= c.t0 && t <= c.t1);
  }

  function draw() {
    const t = vid.currentTime;
    fill.style.width = ((t / total) * 100) + '%';
    timeEl.textContent = `${fmt(t)} / ${fmt(total)}`;
    if (caps.classList.contains('on')) {
      const c = captionAt(t);
      caps.textContent = c ? c.text : '';
    }
  }

  function setPlaying(p) {
    playBin.textContent = p ? '❙❙' : '▶';
    bigplay.classList.toggle('hide', p);
    if (p) {
      vid.play().catch(() => {});
      showUI();
    } else {
      vid.pause();
      ui.classList.remove('hide');
    }
  }

  vid.addEventListener('play', () => setPlaying(true));
  vid.addEventListener('pause', () => { playBin.textContent = '▶'; bigplay.classList.remove('hide'); ui.classList.remove('hide'); });
  vid.addEventListener('timeupdate', draw);
  vid.addEventListener('loadedmetadata', () => { draw(); });
  vid.addEventListener('ended', () => { bigplay.classList.remove('hide'); ui.classList.remove('hide'); });

  playBin.addEventListener('click', () => (vid.paused ? vid.play() : vid.pause()));
  bigplay.addEventListener('click', () => vid.play());
  document.addEventListener('mousemove', () => showUI());

  let dragging = false;
  function seekTo(e) {
    const r = scrub.getBoundingClientRect();
    vid.currentTime = clamp((e.clientX - r.left) / r.width) * total;
    draw();
  }
  scrub.addEventListener('pointerdown', e => {
    dragging = true;
    scrub.setPointerCapture(e.pointerId);
    seekTo(e);
  });
  scrub.addEventListener('pointermove', e => { if (dragging) seekTo(e); });
  scrub.addEventListener('pointerup', () => { dragging = false; });

  function toggleCC() {
    caps.classList.toggle('on');
    document.getElementById('cc').style.opacity = caps.classList.contains('on') ? 1 : 0.45;
    if (caps.classList.contains('on')) draw(); else caps.textContent = '';
  }
  document.getElementById('cc').addEventListener('click', toggleCC);
  document.getElementById('fs').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  document.addEventListener('keydown', e => {
    if (e.key === ' ') { e.preventDefault(); vid.paused ? vid.play() : vid.pause(); }
    if (e.key === 'ArrowRight') vid.currentTime = Math.min(total, vid.currentTime + 5);
    if (e.key === 'ArrowLeft') vid.currentTime = Math.max(0, vid.currentTime - 5);
    if (e.key.toLowerCase() === 'c') toggleCC();
    if (e.key.toLowerCase() === 'f') document.getElementById('fs').click();
  });

  document.addEventListener('fullscreenchange', () => {
    // the video keeps its 16:9 box via CSS
  });

  vid.addEventListener('error', () => {
    document.getElementById('badge').textContent = 'HumanCOIN · could not load HumanCOIN-60s.mp4';
  });

  draw();
  showUI(3000);
})();
