// Project Beats — Menu (osu!-style)
// Core engine API calls are untouched from previous version:
//   PBEngine.setSong / setDifficulty / setBpm / start / exitToMenu
// DOM IDs that engine.js and index.html depend on are all preserved.

(() => {
  function assetUrl(relPath) {
    const clean = String(relPath).replace(/^\/+/, '');
    const base  = new URL('.', location.href);
    return new URL(clean, base).toString();
  }

  const FALLBACK_SONGS = [
    {
      id:     'demo',
      title:  'Teto Territory',
      artist: '2hot4tv',
      bpm:    172,
      audio:  'assets/defaults/song-demo.mp3',
      mv:     'assets/defaults/mv-default.mp4',
      charts: { Easy: 2, Normal: 5, Hard: 8, Extreme: 10 },
    },
  ];

  let songs      = [...FALLBACK_SONGS];
  let filterText = '';
  let filtered   = [...songs];
  let songIndex  = 0;
  let diffIndex  = 0;

  // ── DOM refs that index.html declares ─────────────────────────────
  const elRoot        = document.getElementById('menu-root');
  const elList        = document.getElementById('songList');
  const elSearch      = document.getElementById('search');
  const elTitle       = document.getElementById('songTitle');
  const elArtist      = document.getElementById('songArtist');
  const elBpm         = document.getElementById('songBpm');        // hidden sink
  const elDiff        = document.getElementById('songDiff');       // hidden sink
  const elDiffButtons = document.getElementById('diffButtons');
  const elDiffDots    = document.getElementById('diff-dots');
  const elBpmDisplay  = document.getElementById('bpmDisplay');
  const btnStart      = document.getElementById('btnStart');

  // ── Diff colour palette (osu! difficulty colours) ─────────────────
  const DIFF_COLORS = {
    Easy:    '#88e05a',
    Normal:  '#66d9ff',
    Hard:    '#ffcc33',
    Extreme: '#ff3385',
  };
  function diffColor(name) {
    return DIFF_COLORS[name] || '#ff66ab';
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function getDiffList(song) {
    if (song?.charts && typeof song.charts === 'object') return Object.keys(song.charts);
    if (Array.isArray(song?.diffs) && song.diffs.length)  return song.diffs;
    return ['Normal'];
  }

  function diffStars(song, d) {
    // Numeric star rating from charts map, clamped 1–10
    const v = song?.charts?.[d];
    return typeof v === 'number' ? clamp(v, 1, 10) : 0;
  }

  function diffLabel(song, d) {
    const v = song?.charts?.[d];
    return typeof v === 'number' ? `${d} ★${v}` : d;
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ── Data loading ──────────────────────────────────────────────────
  async function loadSongsJson() {
    try {
      const res  = await fetch(assetUrl('songs.json'), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (Array.isArray(data) && data.length) songs = data;
      else console.warn('songs.json empty/invalid → fallback');
    } catch (e) {
      console.warn('songs.json unavailable → fallback', e);
    }
  }

  function applyFilter() {
    const q = filterText.trim().toLowerCase();
    filtered = songs.filter(s =>
      String(s.title  || '').toLowerCase().includes(q) ||
      String(s.artist || '').toLowerCase().includes(q)
    );
    songIndex = clamp(songIndex, 0, Math.max(0, filtered.length - 1));
    diffIndex = 0;
  }

  function getSong() { return filtered[songIndex] || null; }

  // ── Render: song list as osu!-style stacked cards ─────────────────
  function renderList() {
    elList.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:20px;font-size:.8rem;color:rgba(255,255,255,.35);text-align:center;';
      empty.textContent = 'No songs found';
      elList.appendChild(empty);
      return;
    }

    filtered.forEach((s, idx) => {
      const isSel   = idx === songIndex;
      const diffs   = getDiffList(s);
      const maxStar = Math.max(...diffs.map(d => diffStars(s, d)));

      const btn = document.createElement('button');
      btn.className = isSel ? 'osu-selected' : '';

      // Mini star strip — up to 5 dots representing max difficulty
      const starCount = Math.min(Math.round(maxStar / 2), 5);
      const starDots  = Array.from({ length: 5 }, (_, i) =>
        `<div class="card-star${i < starCount ? ' lit' : ''}"></div>`
      ).join('');

      btn.innerHTML = `
        <div class="card-title">${escHtml(s.title ?? 'Untitled')}</div>
        <div class="card-meta">
          <div class="card-artist">${escHtml(s.artist ?? 'Unknown')}</div>
          ${s.bpm ? `<div class="card-bpm">${s.bpm} BPM</div>` : ''}
          <div class="card-stars">${starDots}</div>
        </div>
      `;

      btn.addEventListener('click', () => {
        songIndex = idx;
        diffIndex = 0;
        sync(true);
      });

      elList.appendChild(btn);
    });

    // Scroll selected card into view
    elList.children[songIndex]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  // ── Render: difficulty pills ───────────────────────────────────────
  function renderDiffs(song) {
    elDiffButtons.innerHTML = '';
    if (!song) return;
    const diffs = getDiffList(song);
    diffIndex   = clamp(diffIndex, 0, diffs.length - 1);

    diffs.forEach((d, idx) => {
      const isSel = idx === diffIndex;
      const col   = diffColor(d);
      const b     = document.createElement('button');

      // Keep menu.js-compatible classes so CSS overrides apply
      b.className = isSel
        ? 'bg-emerald-500/90 border-emerald-300 text-slate-950 font-bold'
        : 'bg-white/5 border-white/10 text-white';

      b.style.cssText = isSel
        ? `--diff-col:${col};`
        : `border-color:${col}44; color:${col};`;

      b.textContent = diffLabel(song, d);

      b.addEventListener('click', () => { diffIndex = idx; sync(false); });
      elDiffButtons.appendChild(b);
    });
  }

  // ── Render: diff dot indicators (osu! star pips) ──────────────────
  function renderDiffDots(song) {
    if (!elDiffDots) return;
    elDiffDots.innerHTML = '';
    if (!song) return;
    const diffs = getDiffList(song);
    diffs.forEach((d, idx) => {
      const dot = document.createElement('div');
      dot.className = `diff-dot${idx === diffIndex ? ' active' : ''}`;
      const col = diffColor(d);
      dot.style.setProperty('--dot-color', col);
      dot.title = d;
      elDiffDots.appendChild(dot);
    });
  }

  // ── Sync everything to current selection ──────────────────────────
  function sync(rerenderList) {
    const song = getSong();
    if (!song) return;

    const diffs    = getDiffList(song);
    const diffName = diffs[diffIndex] || diffs[0] || 'Normal';

    // Fill DOM sinks (some hidden, some visible)
    elTitle.textContent  = song.title  ?? 'Untitled';
    elArtist.textContent = song.artist ?? 'Unknown Artist';
    elBpm.textContent    = song.bpm ? String(song.bpm) : '—'; // hidden sink
    elDiff.textContent   = diffLabel(song, diffName);          // hidden sink

    if (elBpmDisplay) elBpmDisplay.textContent = song.bpm ? String(song.bpm) : '—';

    renderDiffs(song);
    renderDiffDots(song);
    if (rerenderList) renderList();

    // Keep PB_MENU_STATE fresh for p5bg
    window.PB_MENU_STATE = {
      bpm:       song.bpm || 120,
      diffIndex,
      beatPulse: window.PB_MENU_STATE?.beatPulse ?? 0,
    };

    // ── Engine API calls — unchanged from previous version ───────────
    window.PBEngine?.setSong?.(assetUrl(song.audio), assetUrl(song.mv));
    window.PBEngine?.setDifficulty?.(diffName);
    window.PBEngine?.setBpm?.(song.bpm || 120);
  }

  // ── Start game ────────────────────────────────────────────────────
  function start() {
    elRoot.style.display = 'none';
    window.PB_BG_STOP?.();

    window.PBEngine?.start?.().catch?.(e => {
      console.warn('Start blocked:', e);
      elRoot.style.display = 'block';
      window.PB_BG_START?.();
      alert('Click Start again — browser blocked audio.');
    });
  }

  // ── Keyboard navigation ───────────────────────────────────────────
  elSearch.addEventListener('input', () => {
    filterText = elSearch.value;
    applyFilter();
    sync(true);
  });

  document.addEventListener('keydown', e => {
    if (document.activeElement === elSearch && e.key !== 'Escape') return;
    if (elRoot.style.display === 'none') return; // game running — don't hijack

    if      (e.key === 'ArrowDown')  { songIndex = clamp(songIndex + 1, 0, Math.max(0, filtered.length - 1)); diffIndex = 0; sync(true);  e.preventDefault(); }
    else if (e.key === 'ArrowUp')    { songIndex = clamp(songIndex - 1, 0, Math.max(0, filtered.length - 1)); diffIndex = 0; sync(true);  e.preventDefault(); }
    else if (e.key === 'ArrowRight') { diffIndex = clamp(diffIndex + 1, 0, getDiffList(getSong()).length - 1); sync(false); e.preventDefault(); }
    else if (e.key === 'ArrowLeft')  { diffIndex = clamp(diffIndex - 1, 0, getDiffList(getSong()).length - 1); sync(false); e.preventDefault(); }
    else if (e.key === 'Enter')      { start(); e.preventDefault(); }
    else if (e.key === 'Escape')     { elSearch.focus(); e.preventDefault(); }
  });

  btnStart.addEventListener('click', start);

  // ── Init ──────────────────────────────────────────────────────────
  (async () => {
    await loadSongsJson();
    applyFilter();
    sync(true);
    window.PB_BG_START?.();
  })();
})();
