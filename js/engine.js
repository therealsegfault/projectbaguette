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

  if (j !== JUDGE.MISS) {
    combo += 1;
    score += SCORE_VALUES[j];
    maxCombo = Math.max(combo, maxCombo);
  } else combo = 0;

  hitCounts[j] += 1;

  laneFlash[note.lane]     = 1.0;
  laneFlashType[note.lane] = j;

  judgeTexts.push({ x: layout.hitX, y: layout.laneYs[note.lane], text: JUDGE_LABELS[j], col: JUDGE_COLORS[j], ttl: 0.8 });
}

// ─── INPUT HANDLING ───────────────────────────────────────────────
const keyState = {};
window.addEventListener('keydown', e => {
  keyState[e.key.toLowerCase()] = true;
  const lane = LANE_DEFS.findIndex(ld => ld.key === e.key.toLowerCase());
  if (lane >= 0) tryHit(lane);
});
window.addEventListener('keyup', e => { keyState[e.key.toLowerCase()] = false; });

function tryHit(lane) {
  const n = earliestInLane(lane);
  if (isHittable(n, songTime())) applyJudge(n, songTime());
}

// ─── SPAWN NOTES (for demo/testing) ───────────────────────────────
function autoGenerateDemoNotes() {
  notes = [];
  noteSeq = 0;
  const t0 = 0;
  for (let i = 0; i < 64; i++) {
    const lane = i % NUM_LANES;
    const t    = t0 + i * 0.5;
    notes.push(makeNote(lane, t));
  }
}

// ─── UPDATE + DRAW ───────────────────────────────────────────────
function update(dt) {
  const t = songTime();
  // mark missed
  for (const n of notes) {
    if (n.state === STATE.PENDING && t - n.time > WIN().miss) commitJudgement(n, JUDGE.MISS, t);
  }

  // decay lane flash
  for (let i=0;i<NUM_LANES;i++) laneFlash[i] = Math.max(0, laneFlash[i]-dt*2);

  // update judge texts
  judgeTexts = judgeTexts.filter(jt => {
    jt.ttl -= dt;
    return jt.ttl > 0;
  });

  // analyze audio
  if (analyserNode) analyserNode.getByteFrequencyData(analyserBuf);
  beatPulse = analyserBuf.reduce((a,v)=>a+v,0)/analyserBuf.length/256;
}

function draw() {
  ctx.clearRect(0,0,W,H);
  // draw lanes
  for (let i=0;i<NUM_LANES;i++) {
    const y = layout.laneYs[i];
    ctx.fillStyle = laneFlash[i] > 0 ? JUDGE_COLORS[laneFlashType[i]] : '#222';
    ctx.fillRect(layout.hitX-8, y-layout.step*0.4, 16, layout.step*0.8);
  }
  // draw notes
  const t = songTime();
  for (const n of notes) {
    if (n.state !== STATE.PENDING) continue;
    const progress = (n.time - t + n.approach) / n.approach;
    const x = layout.hitX + (layout.spawnX - layout.hitX) * progress;
    const y = layout.laneYs[n.lane];
    ctx.beginPath();
    ctx.arc(x, y, layout.noteR, 0, 2*Math.PI);
    ctx.fillStyle = laneColor(n.lane);
    ctx.fill();
  }
  // draw judge texts
  for (const jt of judgeTexts) {
    ctx.globalAlpha = Math.max(0, jt.ttl);
    ctx.fillStyle   = jt.col;
    ctx.font        = 'bold 18px Share Tech Mono';
    ctx.textAlign   = 'center';
    ctx.fillText(jt.text, jt.x, jt.y - 40*(1-jt.ttl));
    ctx.globalAlpha = 1.0;
  }
}

// ─── GAME LOOP ───────────────────────────────────────────────────
let lastTime = performance.now();
function loop(now) {
  const dt = (now - lastTime)/1000;
  lastTime = now;
  if (!gameRunning) return;
  update(dt);
  draw();
  if (DEBUG) {
    debugPanel.querySelector('#pb-dbg-time').textContent = `t=${songTime().toFixed(3)}`;
    debugPanel.querySelector('#pb-dbg-notes').textContent = `notes=${notes.length}`;
    debugPanel.querySelector('#pb-dbg-fps').textContent   = `fps=${Math.round(1/dt)}`;
    debugPanel.querySelector('#pb-dbg-beat').textContent  = `beat=${beatPulse.toFixed(3)}`;
  }
  animId = requestAnimationFrame(loop);
}

// ─── START/STOP ──────────────────────────────────────────────────
async function startGame() {
  if (gameRunning) return;
  await ensureAudioContext();
  gameRunning = true;
  recomputeLayout();
  if (!notes.length) autoGenerateDemoNotes();
  audioEl.play();
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
  overlay.classList.add('pb-hidden');
}

function stopGame() {
  if (!gameRunning) return;
  gameRunning = false;
  if (animId) cancelAnimationFrame(animId);
  audioEl.pause();
  audioEl.currentTime = 0;
  overlay.classList.remove('pb-hidden');
}

// ─── EVENT BINDINGS ──────────────────────────────────────────────
overlay.addEventListener('click', startGame);
overlay.addEventListener('touchstart', startGame);

const backBtn = document.getElementById('pb-back-btn');
if (backBtn) backBtn.addEventListener('click', stopGame);

document.getElementById('pb-res-retry').addEventListener('click', () => {
  stopGame(); startGame();
});
const resMenu = document.getElementById('pb-res-menu');
if (resMenu) resMenu.addEventListener('click', stopGame);

// ─── INITIALIZE LAYOUT + KEYS ────────────────────────────────────
recomputeLayout();
const keyChips = document.getElementById('pb-key-chips');
LANE_DEFS.forEach((ld,i)=>{
  const c = document.createElement('div');
  c.className = 'pb-key-chip';
  c.textContent = ld.label;
  c.style.borderColor = laneColor(i);
  keyChips.appendChild(c);
});
