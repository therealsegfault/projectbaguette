'use strict';
/* ═══════════════════════════════════════════════════════════════════
   PROJECT BEATS — Horizontal Lane Engine
   MuseDash-style: notes fly RIGHT→LEFT, hit line on the left.

   Architecture mirrors Kotlin EngineCore invariants:
     • NoteObject: { time, lane, type, state }
     • Earliest pending note per lane drives hit checks
     • Timing anchored to Web Audio API (AudioContext.currentTime)
     • hit/miss state machine: pending → hit | missed

   Mounts into:
     • Menu mode  (__PB_MENU_MODE__ = true): injects canvas/audio/UI
       into #game-root, returns to menu via PBEngine.exitToMenu()
     • Standalone  (no flag): builds full page overlay itself
   ═══════════════════════════════════════════════════════════════════ */

// ─── URL FLAGS ────────────────────────────────────────────────────
const DEBUG     = new URLSearchParams(location.search).get('debug') === '1';
const MENU_MODE = !!window.__PB_MENU_MODE__;

// ─── CSS (injected once) ──────────────────────────────────────────
(function injectStyles() {
  if (document.getElementById('pb-engine-styles')) return;
  const s = document.createElement('style');
  s.id = 'pb-engine-styles';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,400;0,700;0,900;1,900&family=Share+Tech+Mono&display=swap');

    #pb-overlay {
      position:absolute; inset:0; z-index:10;
      background:radial-gradient(ellipse at 50% 60%, #0d0014 0%, #000 70%);
      display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:18px;
      font-family:'Exo 2',sans-serif; color:#fff;
    }
    #pb-overlay.pb-hidden { display:none; }

    .pb-ol-title {
      font-size:clamp(2rem,5vw,3.5rem); font-weight:900; font-style:italic;
      letter-spacing:-0.03em; line-height:1;
      background:linear-gradient(135deg,#ff3366,#cc66ff 60%,#00e5ff);
      -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    }
    .pb-ol-sub {
      font-family:'Share Tech Mono',monospace;
      font-size:.85rem; color:rgba(255,255,255,.45); letter-spacing:.12em;
    }
    .pb-key-chips { display:flex; gap:12px; margin-top:8px; }
    .pb-key-chip {
      width:48px; height:48px; border-radius:8px;
      display:flex; align-items:center; justify-content:center;
      font-family:'Share Tech Mono',monospace; font-size:1rem; font-weight:700;
      border:2px solid;
    }
    .pb-ol-tap {
      font-size:.95rem; color:rgba(255,255,255,.55); letter-spacing:.08em;
      animation:pb-blink 1.1s ease-in-out infinite alternate;
    }
    @keyframes pb-blink { from{opacity:.3} to{opacity:.9} }

    #pb-hud {
      position:absolute; top:0; left:0; right:0; height:52px; z-index:5;
      display:flex; align-items:center; padding:0 20px; gap:24px;
      background:linear-gradient(to bottom,rgba(0,0,0,.7) 0%,transparent 100%);
      font-family:'Exo 2',sans-serif; pointer-events:none;
    }
    #pb-score {
      font-family:'Share Tech Mono',monospace; font-size:1.5rem; font-weight:700;
      letter-spacing:.04em; text-shadow:0 0 16px rgba(255,255,255,.4);
    }
    #pb-combo {
      font-size:1rem; font-weight:700;
      color:rgba(255,255,255,.5); font-family:'Share Tech Mono',monospace;
      transition:color .15s;
    }
    #pb-combo.pb-combo-hot { color:#ffcc00; text-shadow:0 0 12px rgba(255,204,0,.7); }
    #pb-diff-badge {
      margin-left:auto; font-family:'Share Tech Mono',monospace;
      font-size:.7rem; letter-spacing:.15em; padding:4px 10px; border-radius:4px;
      border:1px solid rgba(255,255,255,.2); color:rgba(255,255,255,.5);
      pointer-events:auto;
    }
    #pb-back-btn {
      font-family:'Share Tech Mono',monospace; font-size:.7rem; letter-spacing:.1em;
      padding:4px 12px; border-radius:4px;
      border:1px solid rgba(255,255,255,.15); color:rgba(255,255,255,.4);
      background:transparent; cursor:pointer; pointer-events:auto;
      transition:color .15s, border-color .15s;
    }
    #pb-back-btn:hover { color:#fff; border-color:rgba(255,255,255,.4); }

    #pb-results {
      position:absolute; inset:0; z-index:20;
      background:rgba(0,0,0,.88);
      display:none; flex-direction:column;
      align-items:center; justify-content:center; gap:14px;
      font-family:'Exo 2',sans-serif;
    }
    #pb-results.pb-visible { display:flex; }
    .pb-results-title {
      font-size:clamp(1.5rem,4vw,2.5rem); font-weight:900; font-style:italic;
      letter-spacing:-.02em;
      background:linear-gradient(135deg,#ff3366,#ffcc00);
      -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    }
    .pb-results-row {
      font-family:'Share Tech Mono',monospace;
      font-size:1rem; color:rgba(255,255,255,.6);
      display:flex; gap:16px;
    }
    .pb-results-row span { color:#fff; font-size:1.2rem; min-width:48px; text-align:right; }
    .pb-results-actions { display:flex; gap:12px; margin-top:8px; }
    .pb-results-btn {
      padding:10px 28px; border-radius:8px;
      background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.2);
      color:#fff; font-family:'Exo 2',sans-serif; font-size:.95rem;
      font-weight:700; cursor:pointer; transition:background .15s;
    }
    .pb-results-btn:hover { background:rgba(255,255,255,.16); }

    #pb-debug {
      display:none; position:absolute; bottom:8px; right:8px;
      background:rgba(0,0,0,.8); border:1px solid rgba(255,255,255,.15);
      padding:8px 12px; font-family:'Share Tech Mono',monospace;
      font-size:11px; color:#aaa; border-radius:6px; z-index:30; line-height:1.6;
    }
    #pb-debug.pb-debug-on { display:block; }
  `;
  document.head.appendChild(s);
})();

// ─── BUILD DOM INTO #game-root ────────────────────────────────────
const gameRoot = document.getElementById('game-root') || document.body;

const canvas   = document.createElement('canvas');
canvas.id      = 'pb-canvas';
canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';

const audioEl  = document.createElement('audio');
audioEl.id     = 'pb-audio';
audioEl.preload = 'auto';
if (!MENU_MODE) audioEl.src = 'assets/defaults/song-demo.mp3';

const overlay = document.createElement('div');
overlay.id    = 'pb-overlay';
overlay.innerHTML = `
  <div class="pb-ol-title">PROJECT BEATS</div>
  <div class="pb-ol-sub">LANE ENGINE v2</div>
  <div class="pb-key-chips" id="pb-key-chips"></div>
  <div class="pb-ol-tap">PRESS ENTER OR TAP TO START</div>
`;

const hud = document.createElement('div');
hud.id    = 'pb-hud';
hud.innerHTML = `
  <div id="pb-score">000000</div>
  <div id="pb-combo">x0</div>
  ${MENU_MODE ? '<button id="pb-back-btn">← MENU</button>' : ''}
  <div id="pb-diff-badge">NORMAL</div>
`;

const results = document.createElement('div');
results.id    = 'pb-results';
results.innerHTML = `
  <div class="pb-results-title">STAGE CLEAR</div>
  <div class="pb-results-row">Score   <span id="pb-res-score">0</span></div>
  <div class="pb-results-row">Max Combo   <span id="pb-res-combo">0</span></div>
  <div class="pb-results-row">Perfect   <span id="pb-res-perfect">0</span></div>
  <div class="pb-results-row">Cool   <span id="pb-res-cool">0</span></div>
  <div class="pb-results-row">Fine   <span id="pb-res-fine">0</span></div>
  <div class="pb-results-row">Sad   <span id="pb-res-sad">0</span></div>
  <div class="pb-results-row">Miss   <span id="pb-res-miss">0</span></div>
  <div class="pb-results-actions">
    <button class="pb-results-btn" id="pb-res-retry">RETRY</button>
    ${MENU_MODE ? '<button class="pb-results-btn" id="pb-res-menu">MENU</button>' : ''}
  </div>
`;

const debugPanel = document.createElement('div');
debugPanel.id    = 'pb-debug';
if (DEBUG) debugPanel.classList.add('pb-debug-on');
debugPanel.innerHTML = `
  <div id="pb-dbg-time">t=0.000</div>
  <div id="pb-dbg-notes">notes=0</div>
  <div id="pb-dbg-fps">fps=0</div>
  <div id="pb-dbg-beat">beat=0.000</div>
`;

gameRoot.appendChild(canvas);
gameRoot.appendChild(audioEl);
gameRoot.appendChild(overlay);
gameRoot.appendChild(hud);
gameRoot.appendChild(results);
gameRoot.appendChild(debugPanel);

// ─── CANVAS + CONTEXT ─────────────────────────────────────────────
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

function fitCanvas() {
  DPR = window.devicePixelRatio || 1;
  W   = gameRoot.clientWidth  || window.innerWidth;
  H   = gameRoot.clientHeight || window.innerHeight;
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width  = '100%';
  canvas.style.height = '100%';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ─── AUDIO CONTEXT ────────────────────────────────────────────────
let AC           = null;
let mediaNode    = null;
let gainNode     = null;
let analyserNode = null;

function songTime() {
  if (!audioEl || isNaN(audioEl.currentTime)) return 0;
  return audioEl.currentTime;
}

async function ensureAudioContext() {
  const AcClass = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    AC           = new AcClass();
    analyserNode = AC.createAnalyser();
    analyserNode.fftSize = 512;
    gainNode     = AC.createGain();
    gainNode.gain.value = 1.0;
    mediaNode    = AC.createMediaElementSource(audioEl);
    mediaNode.connect(analyserNode);
    analyserNode.connect(gainNode);
    gainNode.connect(AC.destination);
  }
  if (AC.state === 'suspended') {
    try { await AC.resume(); } catch (e) {}
  }
}

// ─── DIFFICULTY PRESETS ───────────────────────────────────────────
const DIFFS = {
  Easy:    { approach: 2.0, windows: { perfect:.11, good:.25, safe:.34, sad:.42, miss:.50 } },
  Normal:  { approach: 1.6, windows: { perfect:.08, good:.18, safe:.26, sad:.33, miss:.40 } },
  Hard:    { approach: 1.3, windows: { perfect:.065, good:.15, safe:.22, sad:.28, miss:.34 } },
  Extreme: { approach: 1.1, windows: { perfect:.055, good:.13, safe:.19, sad:.25, miss:.30 } },
};
let DIFF = 'Normal';
function D()       { return DIFFS[DIFF] || DIFFS.Normal; }
function WIN()     { return D().windows; }
function APPROACH(){ return D().approach; }

// ─── LANE CONFIG ──────────────────────────────────────────────────
const LANE_DEFS = [
  { key: 's', label: 'S' },
  { key: 'd', label: 'D' },
  { key: 'j', label: 'J' },
  { key: 'k', label: 'K' },
];
const NUM_LANES = LANE_DEFS.length;
const COLORS    = ['#ff3366', '#ffcc00', '#00e5ff', '#cc66ff'];
function laneColor(i) { return COLORS[i % COLORS.length]; }

// ─── LAYOUT (recomputed each frame) ──────────────────────────────
let layout = {};
function recomputeLayout() {
  const hitX    = W * 0.14;
  const topY    = H * 0.18;
  const bottomY = H * 0.82;
  const span    = bottomY - topY;
  const step    = NUM_LANES > 1 ? span / (NUM_LANES - 1) : span;
  const laneYs  = Array.from({ length: NUM_LANES }, (_, i) => topY + i * step);
  const noteR    = Math.min(step * 0.38, 26);
  const hitZoneR = noteR * 1.55;
  const spawnX   = W + noteR * 6;
  layout = { hitX, laneYs, noteR, hitZoneR, spawnX, step };
}

// ─── NOTE STATE MACHINE ───────────────────────────────────────────
const STATE = { PENDING: 0, HIT: 1, MISSED: 2 };
const JUDGE = { PERFECT: 0, COOL: 1, FINE: 2, SAD: 3, MISS: 4 };
const JUDGE_LABELS = ['PERFECT', 'COOL', 'FINE', 'SAD', 'MISS'];
const JUDGE_COLORS = ['#ffff66', '#66ffcc', '#aaaaff', '#ff9944', '#ff4444'];
const SCORE_VALUES = [500, 300, 150, 50, 0];

// ─── ENGINE STATE ─────────────────────────────────────────────────
let notes      = [];
let noteSeq    = 0;
let particles  = [];
let judgeTexts = [];
let score      = 0;
let combo      = 0;
let maxCombo   = 0;
const hitCounts = [0, 0, 0, 0, 0];

const laneFlash     = new Array(NUM_LANES).fill(0);
const laneFlashType = new Array(NUM_LANES).fill(0);

let gameRunning  = false;
let animId       = null;
let beatPulse    = 0;
let lastBeatPulse = 0;
const analyserBuf = new Uint8Array(256);

// ─── NOTE FACTORY ─────────────────────────────────────────────────
function makeNote(lane, time) {
  return {
    seq:         noteSeq++,
    lane,
    time,
    type:        'TAP',
    state:       STATE.PENDING,
    spawnTime:   time - APPROACH(),
    approach:    APPROACH(),
    judgement:   null,
    judgedAt:    0,
    judgeOffset: 0,
  };
}

// ─── EARLIEST PENDING PER LANE (mirrors Kotlin EngineCore) ────────
function earliestInLane(lane) {
  let best = null;
  for (const n of notes) {
    if (n.state !== STATE.PENDING) continue;
    if (n.lane  !== lane) continue;
    if (!best || n.time < best.time || (n.time === best.time && n.seq < best.seq))
      best = n;
  }
  return best;
}

// FIX: symmetric window — matches Kotlin abs(tNow - timeSeconds) <= windows.miss
function isHittable(note, t) {
  if (!note) return false;
  return Math.abs(t - note.time) <= WIN().miss;
}

// ─── JUDGEMENT ────────────────────────────────────────────────────
function applyJudge(note, t) {
  const dt = Math.abs(t - note.time);
  const w  = WIN();
  let j;
  if      (dt <= w.perfect) j = JUDGE.PERFECT;
  else if (dt <= w.good)    j = JUDGE.COOL;
  else if (dt <= w.safe)    j = JUDGE.FINE;
  else if (dt <= w.sad)     j = JUDGE.SAD;
  else                      j = JUDGE.MISS;
  commitJudgement(note, j, t);
}

function commitJudgement(note, j, t) {
  if (note.state !== STATE.PENDING) return; // guard double-judge

  note.state       = j === JUDGE.MISS ? STATE.MISSED : STATE.HIT;
  note.judgement   = j;
  note.judgedAt    = t;
  note.judgeOffset = t - note.time;

  hitCounts[j]++;

  if (j < JUDGE.SAD) {
    combo++;
    score += Math.floor(SCORE_VALUES[j] * (1 + combo * 0.02));
  } else if (j === JUDGE.SAD) {
    // FIX: SAD breaks combo — matches Kotlin applyScore
    score += SCORE_VALUES[j];
    combo  = 0;
  } else {
    combo = 0;
  }
  maxCombo = Math.max(maxCombo, combo);

  pushJudgeText(note.lane, j, t);
  spawnHitParticles(note);
  triggerLaneFlash(note.lane, j);

  // Expose beat for p5bg reactive menu background
  if (window.PB_MENU_STATE) window.PB_MENU_STATE.lastHitTime = t;
}

// FIX: autoMiss runs AFTER renderFrame — prevents ghost note death flicker
function autoMiss(t) {
  for (const n of notes) {
    if (n.state !== STATE.PENDING) continue;
    if (t > n.time + WIN().miss) {
      commitJudgement(n, JUDGE.MISS, n.time + WIN().miss + 0.0001);
    }
  }
}

// ─── INPUT ────────────────────────────────────────────────────────
const keysDown = new Set();

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (keysDown.has(k)) return;
  keysDown.add(k);
  if (!gameRunning) {
    if (e.key === 'Enter' || e.key === ' ') startGame();
    return;
  }
  handleLaneKey(k);
});
window.addEventListener('keyup', e => keysDown.delete(e.key.toLowerCase()));

function handleLaneKey(key) {
  const laneIdx = LANE_DEFS.findIndex(l => l.key === key);
  if (laneIdx === -1) return;
  const t    = songTime();
  const note = earliestInLane(laneIdx);
  if (!isHittable(note, t)) {
    // FIX: ghost press — receptor flashes white, no score change
    triggerLaneFlash(laneIdx, -1);
    return;
  }
  applyJudge(note, t);
}

// Touch: Y-coordinate → nearest lane, full-width tap
canvas.addEventListener('touchstart', e => {
  if (!gameRunning) { startGame(); return; }
  const rect = gameRoot.getBoundingClientRect();
  for (const touch of e.changedTouches) {
    const y = touch.clientY - rect.top;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < NUM_LANES; i++) {
      const d = Math.abs(y - layout.laneYs[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    const t    = songTime();
    const note = earliestInLane(best);
    if (isHittable(note, t)) applyJudge(note, t);
    else triggerLaneFlash(best, -1);
  }
  e.preventDefault();
}, { passive: false });

// ─── CHART LOADING ────────────────────────────────────────────────
let chartNotes  = [];
let nextNoteIdx = 0;
let chartReady  = false;

/**
 * Load a Kotlin-compatible JSON chart.
 * Accepts {t, lane} (demo.json style) and {timeSeconds, lane}.
 */
async function loadChart(src) {
  try {
    const resp = await fetch(src);
    if (!resp.ok) throw new Error(resp.status);
    const obj = await resp.json();
    chartNotes = (obj.notes || [])
      .map(n => ({ time: +(n.t ?? n.timeSeconds ?? 0), lane: +n.lane }))
      .filter(n => n.lane >= 0 && n.lane < NUM_LANES && n.time >= 0)
      // Stable sort by (time, lane) — matches Kotlin ChartToEngine.toNoteEvents()
      .sort((a, b) => a.time - b.time || a.lane - b.lane);
    chartReady = chartNotes.length > 0;
    return chartReady;
  } catch {
    return false;
  }
}

/** Offline beat detection → auto-chart from audio buffer */
async function buildAutoChart() {
  chartNotes = [];
  const audioSrc = audioEl.src;
  try {
    const AcTmp = window.AudioContext || window.webkitAudioContext;
    const tmp   = new AcTmp();
    const resp  = await fetch(audioSrc);
    const buf   = await resp.arrayBuffer();
    const dec   = await tmp.decodeAudioData(buf);

    const ch    = dec.getChannelData(0);
    const sr    = dec.sampleRate;
    const FRAME = 1024, HOP = 512;
    const energy = [];
    for (let i = 0; i + FRAME < ch.length; i += HOP) {
      let s = 0;
      for (let j = 0; j < FRAME; j++) s += ch[i + j] ** 2;
      energy.push(Math.sqrt(s / FRAME));
    }
    const mean = energy.reduce((a, b) => a + b, 0) / energy.length;
    const thr  = mean * 1.22;
    let last   = -99;
    const beats = [];
    for (let i = 1; i < energy.length - 1; i++) {
      const e = energy[i];
      if (e > thr && e > energy[i - 1] && e > energy[i + 1]) {
        const t = (i * HOP) / sr;
        if (t - last >= 0.22) { beats.push(t); last = t; }
      }
    }
    if (beats.length < 8) throw new Error('too few beats');
    tmp.close();

     // --- BPM ESTIMATION + GRID SNAP ---
function estimateBPM(beats) {
  if (beats.length < 6) return 120;
  const intervals = [];
  for (let i = 1; i < beats.length; i++) {
    intervals.push(beats[i] - beats[i - 1]);
  }
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  let bpm = 60 / median;

  // Normalize into common BPM range
  while (bpm < 80) bpm *= 2;
  while (bpm > 220) bpm /= 2;
  return bpm;
}

const estBpm = estimateBPM(beats);
const beatDur = 60 / estBpm;

// Snap beats to nearest grid
for (let i = 0; i < beats.length; i++) {
  beats[i] = Math.round(beats[i] / beatDur) * beatDur;
}

console.log("[PB] Estimated BPM:", estBpm.toFixed(2));
if (window.PB_MENU_STATE) window.PB_MENU_STATE.bpm = estBpm;
for (let bi = 0; bi < beats.length; bi++) {
  const t = beats[bi];

  // simple structured lane pattern
  const lane = (bi + Math.floor(bi / 4)) % NUM_LANES;
  chartNotes.push({ time: t, lane });

  // occasional doubles on offbeats
  if (bi % 8 === 4) {
    chartNotes.push({
      time: t + beatDur * 0.25,
      lane: (lane + 2) % NUM_LANES
    });
  }
}
  } catch {
    // BPM-grid fallback using song BPM from menu state
    const bpm  = window.PB_MENU_STATE?.bpm || 120;
    const beat = 60 / bpm;
    for (let t = 0.5, i = 0; t < 180; t += beat, i++) {
      chartNotes.push({ time: t, lane: i % NUM_LANES });
    }
  }

  chartNotes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  chartReady = true;
}

// ─── NOTE SPAWNING ────────────────────────────────────────────────
const LOOKAHEAD = 8.0;

function spawnPendingNotes(t) {
  if (!chartReady) return;
  while (nextNoteIdx < chartNotes.length) {
    const cn = chartNotes[nextNoteIdx];
    if (cn.time > t + LOOKAHEAD) break;
    nextNoteIdx++;
    if (cn.time < t - APPROACH()) continue; // already past, skip
    notes.push(makeNote(cn.lane, cn.time));
  }
}

// ─── PARTICLES ────────────────────────────────────────────────────
// FIX: particles only spawn on hit, never on note creation
function spawnHitParticles(note) {
  if (note.state === STATE.MISSED) return;
  recomputeLayout();
  const x     = layout.hitX;
  const y     = layout.laneYs[note.lane];
  const col   = laneColor(note.lane);
  const count = note.judgement === JUDGE.PERFECT ? 22 : 10;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 80 + Math.random() * 260;
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 1,
      maxLife: 0.4 + Math.random() * 0.3,
      size: 2 + Math.random() * 3,
      color: col,
    });
  }
}

function triggerLaneFlash(lane, judgeType) {
  laneFlash[lane]     = 1.0;
  laneFlashType[lane] = judgeType;
}

// ─── JUDGEMENT TEXT ───────────────────────────────────────────────
function pushJudgeText(lane, j, t) {
  recomputeLayout();
  judgeTexts.push({
    lane, j, t,
    x:  layout.hitX + 18,
    y:  layout.laneYs[lane],
    vy: -48,
  });
  if (judgeTexts.length > 40) judgeTexts.splice(0, judgeTexts.length - 40);
}

// ─── DRAW: BACKGROUND ─────────────────────────────────────────────
function drawBackground() {
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < NUM_LANES; i++) {
    const y = layout.laneYs[i];
    const h = layout.step * 0.94;
    ctx.fillStyle = i % 2 === 0
      ? 'rgba(255,255,255,0.018)'
      : 'rgba(255,255,255,0.008)';
    ctx.fillRect(0, y - h * 0.5, W, h);
  }

  // Dashed lane guide lines (right of hit line)
  for (let i = 0; i < NUM_LANES; i++) {
    const y = layout.laneYs[i];
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 14]);
    ctx.beginPath();
    ctx.moveTo(layout.hitX + 12, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // CRT scanlines
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(0, y, W, 1);
  }
}

// ─── DRAW: HIT LINE + RECEPTORS ───────────────────────────────────
function drawHitLine() {
  const x      = layout.hitX;
  const margin = layout.step * 0.55;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth   = 2;
  ctx.shadowColor = 'rgba(255,255,255,0.25)';
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.moveTo(x, layout.laneYs[0] - margin);
  ctx.lineTo(x, layout.laneYs[NUM_LANES - 1] + margin);
  ctx.stroke();
  ctx.restore();

  for (let i = 0; i < NUM_LANES; i++) {
    const y       = layout.laneYs[i];
    const r       = layout.hitZoneR;
    const col     = laneColor(i);
    const flash   = laneFlash[i];
    const isGhost = laneFlashType[i] === -1;

    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur  = 6 + beatPulse * 12 + flash * 24;

    // Dark well
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();

    // Receptor ring
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = flash > 0
      ? (isGhost ? 'rgba(255,255,255,0.6)' : col)
      : `rgba(255,255,255,${0.2 + beatPulse * 0.15})`;
    ctx.lineWidth = 2 + flash * 3;
    ctx.stroke();

    // Flash inner fill
    if (flash > 0.05) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
      const alpha = Math.floor(flash * 80).toString(16).padStart(2, '0');
      ctx.fillStyle = `${col}${alpha}`;
      ctx.fill();
    }

    // Key label
    ctx.fillStyle = `rgba(255,255,255,${0.3 + flash * 0.55})`;
    ctx.font      = `bold ${Math.floor(r * 0.7)}px 'Share Tech Mono', monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LANE_DEFS[i].label, x, y);

    ctx.restore();
  }
}

// ─── DRAW: NOTES ──────────────────────────────────────────────────
function noteXAt(note, t) {
  const elapsed  = t - note.spawnTime;
  const progress = Math.max(0, Math.min(1, elapsed / note.approach));

  // Rhythm games MUST use constant velocity.
  // Easing breaks beat perception.
  return layout.spawnX + (layout.hitX - layout.spawnX) * progress;
}

function drawNote(note, t) {
  if (note.state !== STATE.PENDING) return;
  if (t < note.spawnTime - 0.05) return;

  const x   = noteXAt(note, t);
  const y   = layout.laneYs[note.lane];
  const r   = layout.noteR;
  const col = laneColor(note.lane);

  // Don't render past the hit line — prevents ghost flicker
  if (x < layout.hitX - r * 2.5) return;

  const dist = Math.abs(x - layout.hitX);
  const near = Math.max(0, 1 - dist / (W * 0.3));

  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = col;
  ctx.shadowBlur  = 6 + near * 20;

  // Pixel-art square body
  ctx.fillStyle   = 'rgba(0,0,0,0.75)';
  ctx.fillRect(-r - 2, -r - 2, r * 2 + 4, r * 2 + 4);
  ctx.fillStyle   = col;
  ctx.globalAlpha = 0.85 + near * 0.15;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  // Inner highlight square
  ctx.fillStyle   = '#fff';
  ctx.globalAlpha = 0.3 + near * 0.38;
  const ih = r * 0.45;
  ctx.fillRect(-ih, -ih, ih * 2, ih * 2);

  // Approach ring (when close to hit line)
  if (near > 0.12) {
    ctx.globalAlpha = near * 0.5;
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.5;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.5 + (1 - near) * 0.8), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── DRAW: HIT/MISS EFFECTS ───────────────────────────────────────
const HIT_FADE  = 0.45;
const MISS_FADE = 0.60;

function drawHitEffect(note, t) {
  if (note.state === STATE.PENDING) return;
  const age = t - note.judgedAt;
  const x   = layout.hitX;
  const y   = layout.laneYs[note.lane];

  if (note.state === STATE.HIT && age < HIT_FADE) {
    const p   = age / HIT_FADE;
    const col = laneColor(note.lane);
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 20 + p * 10;
    ctx.strokeStyle = col;
    ctx.lineWidth   = 3 - p * 2;
    ctx.beginPath();
    ctx.arc(x, y, layout.hitZoneR * (1 + p * 1.4), 0, Math.PI * 2);
    ctx.stroke();
    const sz = layout.noteR * (1.2 + p * 0.5);
    ctx.fillStyle   = col;
    ctx.globalAlpha = (1 - p) * 0.35;
    ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2);
    ctx.restore();

  } else if (note.state === STATE.MISSED && age < MISS_FADE) {
    const p = age / MISS_FADE;
    const s = layout.noteR * (0.8 + p * 0.3);
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.55;
    ctx.strokeStyle = '#ff2244';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
    ctx.stroke();
    ctx.restore();
  }
}

// ─── DRAW: PARTICLES ──────────────────────────────────────────────
function tickParticles(dt) {
  for (const p of particles) {
    p.x   += p.vx * dt;
    p.y   += p.vy * dt;
    p.vy  += 200 * dt;
    p.life = Math.max(0, p.life - dt / p.maxLife);
  }
  particles = particles.filter(p => p.life > 0);
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life * 0.9;
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 4;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.restore();
  }
}

// ─── DRAW: JUDGEMENT TEXT ─────────────────────────────────────────
const JUDGE_TEXT_LIFE = 0.85;

function tickAndDrawJudgeTexts(dt, t) {
  for (let i = judgeTexts.length - 1; i >= 0; i--) {
    const j   = judgeTexts[i];
    const age = t - j.t;
    if (age > JUDGE_TEXT_LIFE) { judgeTexts.splice(i, 1); continue; }

    j.y += j.vy * dt;

    const p     = age / JUDGE_TEXT_LIFE;
    const alpha = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
    const scale = p < 0.1 ? (0.7 + p / 0.1 * 0.3) : 1.0;
    const col   = JUDGE_COLORS[j.j];
    const fs    = Math.floor(layout.noteR * 0.9 * scale);

    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.font         = `900 italic ${fs}px 'Exo 2', sans-serif`;
    ctx.fillStyle    = col;
    ctx.shadowColor  = col;
    ctx.shadowBlur   = 10;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(JUDGE_LABELS[j.j], j.x, j.y);
    ctx.restore();
  }
}

// ─── HUD UPDATE ───────────────────────────────────────────────────
const elScore = document.getElementById('pb-score');
const elCombo = document.getElementById('pb-combo');

function updateHUD() {
  if (elScore) elScore.textContent = String(score).padStart(6, '0');
  if (elCombo) {
    elCombo.textContent = `x${combo}`;
    elCombo.classList.toggle('pb-combo-hot', combo >= 5);
  }
}

// ─── BEAT PULSE (via analyser → p5bg sync) ────────────────────────
function sampleBeatPulse() {
  if (!analyserNode) { beatPulse = 0; return; }
  analyserNode.getByteFrequencyData(analyserBuf);
  let sum = 0;
  for (let i = 0; i < 20; i++) sum += analyserBuf[i];
  const raw    = sum / (20 * 255);
  beatPulse    = lastBeatPulse * 0.85 + raw * 0.15;
  lastBeatPulse = beatPulse;
  if (window.PB_MENU_STATE) window.PB_MENU_STATE.beatPulse = beatPulse;
}

// ─── LANE FLASH DECAY ─────────────────────────────────────────────
function decayLaneFlash() {
  for (let i = 0; i < NUM_LANES; i++) {
    laneFlash[i] *= 0.87;
    if (laneFlash[i] < 0.01) laneFlash[i] = 0;
  }
}

// ─── MAIN RENDER FRAME ────────────────────────────────────────────
let lastFrameTime = performance.now();
let fps = 0;

function renderFrame(t) {
  const now = performance.now();
  fps = 1000 / (now - lastFrameTime + 0.001);
  lastFrameTime = now;
  const dt = Math.min(0.05, 1 / 60);

  recomputeLayout();
  sampleBeatPulse();
  decayLaneFlash();

  drawBackground();
  for (const n of notes) drawHitEffect(n, t);
  drawHitLine();
  for (const n of notes) drawNote(n, t);
  tickParticles(dt);
  drawParticles();
  tickAndDrawJudgeTexts(dt, t);
  updateHUD();

  if (DEBUG) {
    const pending = notes.filter(n => n.state === STATE.PENDING).length;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('pb-dbg-time',  `t=${t.toFixed(3)}`);
    set('pb-dbg-notes', `notes=${pending} / total=${notes.length}`);
    set('pb-dbg-fps',   `fps=${fps.toFixed(0)}`);
    set('pb-dbg-beat',  `beat=${beatPulse.toFixed(3)}`);
  }
}

// ─── MAIN LOOP ────────────────────────────────────────────────────
function loop() {
  if (!gameRunning) return;
  const t = songTime();

  spawnPendingNotes(t);
  renderFrame(t);

  // FIX: autoMiss after render — no ghost note death flicker
  autoMiss(t);

  // Cleanup expired judged notes
  notes = notes.filter(n => {
    if (n.state === STATE.PENDING) return true;
    const age  = t - n.judgedAt;
    const keep = n.state === STATE.HIT ? HIT_FADE : MISS_FADE;
    return age <= keep + 0.1;
  });

  // Song complete check
  if (
    !isNaN(audioEl.duration) && audioEl.duration > 0 &&
    t >= audioEl.duration - 0.3 &&
    nextNoteIdx >= chartNotes.length &&
    notes.every(n => n.state !== STATE.PENDING)
  ) {
    showResults();
    return;
  }

  animId = requestAnimationFrame(loop);
}

// ─── RESET ALL ENGINE STATE ───────────────────────────────────────
function resetState() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  // FIX: full reset on every start — original engine skipped this in startGame()
  notes      = [];
  particles  = [];
  judgeTexts = [];
  score = combo = maxCombo = 0;
  hitCounts.fill(0);
  noteSeq     = 0;
  nextNoteIdx = 0;
  chartReady  = false;
  laneFlash.fill(0);
  gameRunning = false;
}

// ─── START GAME ───────────────────────────────────────────────────
async function startGame() {
  resetState();
  recomputeLayout();
  fitCanvas();

  overlay.classList.add('pb-hidden');
  results.classList.remove('pb-visible');

  if (MENU_MODE) {
    gameRoot.classList.remove('hidden');
    gameRoot.style.display = 'block';
    window.PB_BG_STOP?.();
  }

  await ensureAudioContext();

  if (!chartReady) await buildAutoChart();

  audioEl.currentTime = 0;
  await audioEl.play().catch(() => {});

  gameRunning = true;
  animId = requestAnimationFrame(loop);
}

// ─── RESULTS ─────────────────────────────────────────────────────
function showResults() {
  gameRunning = false;
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  audioEl.pause();

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('pb-res-score',   score);
  set('pb-res-combo',   maxCombo);
  set('pb-res-perfect', hitCounts[JUDGE.PERFECT]);
  set('pb-res-cool',    hitCounts[JUDGE.COOL]);
  set('pb-res-fine',    hitCounts[JUDGE.FINE]);
  set('pb-res-sad',     hitCounts[JUDGE.SAD]);
  set('pb-res-miss',    hitCounts[JUDGE.MISS]);

  results.classList.add('pb-visible');
}

function exitToMenu() {
  resetState();
  results.classList.remove('pb-visible');
  overlay.classList.remove('pb-hidden');

  if (MENU_MODE) {
    gameRoot.classList.add('hidden');
    gameRoot.style.display = 'none';
    const menuRoot = document.getElementById('menu-root');
    if (menuRoot) menuRoot.style.display = 'flex';
    window.PB_BG_START?.();
  }
}

// ─── BUTTON WIRING ───────────────────────────────────────────────
document.getElementById('pb-res-retry')?.addEventListener('click', () => {
  results.classList.remove('pb-visible');
  overlay.classList.remove('pb-hidden');
  chartReady = false; // force rebuild
});
document.getElementById('pb-res-menu')?.addEventListener('click', exitToMenu);
document.getElementById('pb-back-btn')?.addEventListener('click', exitToMenu);

overlay.addEventListener('click',      ()  => startGame());
overlay.addEventListener('touchstart', e   => { startGame(); e.preventDefault(); }, { passive: false });

// ─── KEY CHIPS IN OVERLAY ─────────────────────────────────────────
const chipContainer = document.getElementById('pb-key-chips');
if (chipContainer) {
  LANE_DEFS.forEach((l, i) => {
    const chip = document.createElement('div');
    chip.className = 'pb-key-chip';
    const col = laneColor(i);
    chip.style.background  = `${col}22`;
    chip.style.borderColor = col;
    chip.style.color       = col;
    chip.textContent = l.label.toUpperCase();
    chipContainer.appendChild(chip);
  });
}

// ─── PUBLIC API (drop-in with original PBEngine) ──────────────────
window.PBEngine = {
  start: startGame,

  setSong(audioSrc, _mvSrc) {
    // _mvSrc ignored — new engine is canvas-only (no video element)
    if (audioSrc) audioEl.src = audioSrc;
    resetState();
  },

  setDifficulty(name) {
    if (DIFFS[name]) DIFF = name;
    const badge = document.getElementById('pb-diff-badge');
    if (badge) badge.textContent = DIFF.toUpperCase();
  },

  setBpm(v) {
    // surfaced to p5bg via PB_MENU_STATE for reactive menu animation
    window.PB_MENU_STATE = window.PB_MENU_STATE || {};
    window.PB_MENU_STATE.bpm = Number(v) || 120;
  },

  async setChart(src) {
    return loadChart(src);
  },

  getState: () => ({ score, combo, maxCombo }),

  exitToMenu,
};
