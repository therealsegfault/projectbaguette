/* Project Baguette – Rhythm Engine v3 (Diva subdivision + VFX)
   Includes:
   • Button-shaped notes (W/A/S/D)
   • Ghost targets (circular, fade-in)
   • Trails (faint but bright)
   • Hitbursts (big diva explosions)
   • Diva-style subdivision generator (no multinotes)
*/

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ===== LAYOUT =====
let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

function updateLayout() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
}
window.addEventListener("resize", updateLayout);

// ===== LANES =====
const LANES = [
  { key: "w", label: "W", color: "#FFD447" },
  { key: "a", label: "A", color: "#47FFA3" },
  { key: "s", label: "S", color: "#FF69B4" },
  { key: "d", label: "D", color: "#6AB4FF" },
];

// ===== TIMING =====
const BPM = 120;
const BEAT = 60 / BPM;
const APPROACH_TIME = 1.4 + (240 / BPM);

const HIT_WINDOW_PERFECT = 0.08;
const HIT_WINDOW_GOOD = 0.18;

const HIT_FADE_TIME = 0.4;
const MISS_FADE_TIME = 0.6;
const MISS_FALL_SPEED = 220;
const MISS_SHAKE_AMT = 10;
const MISS_SHAKE_FREQ = 14;

const SPAWN_LOOKAHEAD = 8.0;

let startTime = performance.now() / 1000;
let notes = [];
let nextBeatTime = 1.0;
let beatIndex = 0;

let score = 0;
let combo = 0;
let lastHitText = "";
let lastHitTime = 0;

// ===== UTILS =====
function getSongTime() {
  return performance.now() / 1000 - startTime;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ===== NOTE CREATION =====
function createNote(lane, time) {
  const marginX = width * 0.15;
  const marginY = height * 0.15;

  const tx = marginX + Math.random() * (width - marginX * 2);
  const ty = marginY + Math.random() * (height - marginY * 2);

  const cx = width / 2;
  const cy = height / 2;

  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;

  const spawnDist = Math.max(width, height) * 0.7;
  const sx = tx - nx * spawnDist;
  const sy = ty - ny * spawnDist;

  notes.push({
    time,
    lane,
    spawnX: sx,
    spawnY: sy,
    targetX: tx,
    targetY: ty,

    judged: false,
    effect: "none",
    effectTime: 0,

    shakeSeed: Math.random() * Math.PI * 2,
  });
}

// ===== DIVA SUBDIVISION PATTERNS =====
// patternTable[measure][beat][subdivision] = laneIndex or null
const patternTable = [
  // Measure 0 — simple
  [
    [0, null, null, null],      // Beat 1: W---
    [1, null, 2,    null],      // Beat 2: A-S-
    [null, null, null, null],   // Beat 3: ----
    [3, null, null, null],      // Beat 4: D---
  ],

  // Measure 1 — variation
  [
    [0, null, 1, null],         // W - A -
    [null, null, 2, null],      // -- S -
    [1, null, null, 3],         // A - - D
    [null, 0, null, null],      // - W - -
  ],
];

function generateNotes(songTime) {
  while (nextBeatTime < songTime + SPAWN_LOOKAHEAD) {

    // If too many notes exist, delay the entire beat
    if (notes.filter(n => !n.judged).length >= 4) {
      nextBeatTime += BEAT;
      beatIndex++;
      continue; // skip creating notes this beat
    }

    const measureIndex = Math.floor(beatIndex / 4) % patternTable.length;
    const beatInMeasure = beatIndex % 4;

    const beatPattern = patternTable[measureIndex][beatInMeasure];

    // process subdivisions normally
    for (let sub = 0; sub < 4; sub++) {
      const lane = beatPattern[sub];
      if (lane !== null) {
        const subdivisionTime = nextBeatTime + sub * (BEAT / 4);
        createNote(lane, subdivisionTime);
      }
    }

    nextBeatTime += BEAT;
    beatIndex++;
  }
}

// ===== INPUT =====
const keysDown = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (!keysDown.has(k)) {
    keysDown.add(k);
    handleKey(k);
  }
});
window.addEventListener("keyup", (e) => keysDown.delete(e.key.toLowerCase()));

function handleKey(key) {
  const laneIndex = LANES.findIndex((l) => l.key === key);
  if (laneIndex === -1) return;

  const songTime = getSongTime();

  let best = null;
  let diff = Infinity;

  for (const n of notes) {
    if (!n.judged && n.lane === laneIndex) {
      const d = Math.abs(n.time - songTime);
      if (d < diff) {
        diff = d;
        best = n;
      }
    }
  }

  if (!best) return;

  if (diff <= HIT_WINDOW_PERFECT) registerHit(best, "COOL", 300);
  else if (diff <= HIT_WINDOW_GOOD) registerHit(best, "FINE", 100);
}

function registerHit(note, label, baseScore) {
  const t = getSongTime();

  note.judged = true;
  note.effect = "hit";
  note.effectTime = t;

  combo++;
  score += Math.floor(baseScore * (1 + combo * 0.05));

  lastHitText = label;
  lastHitTime = t;
}

function registerMiss(note) {
  const t = getSongTime();

  note.judged = true;
  note.effect = "miss";
  note.effectTime = t;

  combo = 0;
  lastHitText = "MISS";
  lastHitTime = t;
}

// ===== VISUALS =====

// ghost targets
function drawGhostTarget(note, baseR) {
  const songTime = getSongTime();
  const dt = note.time - songTime;

  const approach = Math.max(0, Math.min(1, 1 - dt / APPROACH_TIME));
  const alpha = 0.18 + approach * 0.22;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = LANES[note.lane].color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(note.targetX, note.targetY, baseR * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// trails
function drawTrail(note, x, y) {
  const lane = LANES[note.lane];

  const dx = note.targetX - note.spawnX;
  const dy = note.targetY - note.spawnY;
  const len = Math.hypot(dx, dy);
  const nx = dx / len, ny = dy / len;

  const trailLen = 130;
  const tx = x - nx * trailLen;
  const ty = y - ny * trailLen;

  ctx.save();
  ctx.strokeStyle = lane.color;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

// button-shaped notes
function drawButtonNote(x, y, r, lane) {
  ctx.save();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.strokeStyle = lane.color;
  ctx.lineWidth = 6;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = lane.color;
  ctx.font = `${r * 1.2}px Arial Black`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(lane.label, x, y + r * 0.05);

  ctx.restore();
}

// hitburst
function drawHitburst(note, age, baseR) {
  const lane = LANES[note.lane];
  const prog = age / HIT_FADE_TIME;

  const r = baseR * (1 + prog * 2.2);
  const alpha = 1 - prog;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = lane.color;

  ctx.beginPath();
  ctx.arc(note.targetX, note.targetY, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = `${r * 0.8}px Arial Black`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(lane.label, note.targetX, note.targetY);

  ctx.restore();
}

// ===== DRAW LOOP =====
let fps = 0;
let lastFrame = performance.now();

function loop() {
  const now = performance.now();
  fps = 1000 / (now - lastFrame);
  lastFrame = now;

  const songTime = getSongTime();
  generateNotes(songTime);

  // auto-miss
  for (const n of notes) {
    if (!n.judged && songTime > n.time + HIT_WINDOW_GOOD) {
      registerMiss(n);
    }
  }

  draw(songTime);

  notes = notes.filter((n) => {
    if (!n.judged) return true;
    if (n.effect === "hit"  && songTime - n.effectTime <= HIT_FADE_TIME) return true;
    if (n.effect === "miss" && songTime - n.effectTime <= MISS_FADE_TIME) return true;
    return false;
  });

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ===== DRAW =====
function draw(songTime) {
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, width, height);

  const baseR = Math.min(width, height) * 0.045;

  for (const n of notes) {
    const lane = LANES[n.lane];

    drawGhostTarget(n, baseR);

    let x, y;

    if (!n.judged) {
      const dt = n.time - songTime;
      const t = 1 - dt / APPROACH_TIME;
      if (t < 0 || t > 1.5) continue;

      x = lerp(n.spawnX, n.targetX, t);
      y = lerp(n.spawnY, n.targetY, t);

      drawTrail(n, x, y);
      drawButtonNote(x, y, baseR, lane);

    } else if (n.effect === "hit") {
      const age = songTime - n.effectTime;
      if (age <= HIT_FADE_TIME) drawHitburst(n, age, baseR);

    } else if (n.effect === "miss") {
      const age = songTime - n.effectTime;
      if (age <= MISS_FADE_TIME) {
        const fall = age * MISS_FALL_SPEED;
        const shake = Math.sin(age * MISS_SHAKE_FREQ * Math.PI * 2 + n.shakeSeed) * MISS_SHAKE_AMT;

        x = n.targetX + shake;
        y = n.targetY + fall;

        const alpha = 1 - age / MISS_FADE_TIME;
        ctx.globalAlpha = alpha;
        drawButtonNote(x, y, baseR, lane);
        ctx.globalAlpha = 1;
      }
    }
  }

  // HUD
  ctx.fillStyle = "#fff";
  ctx.font = "18px Arial";
  ctx.fillText("Project Baguette", 20, 30);
  ctx.fillText("Score: " + score, 20, 55);
  ctx.fillText("Combo: " + combo, 20, 80);

  const st = songTime;
  if (st - lastHitTime < 0.5 && lastHitText) {
    ctx.font = "32px Arial Black";
    ctx.textAlign = "center";
    ctx.fillText(lastHitText, width / 2, height * 0.2);
  }

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(width - 190, 10, 180, 70);

  ctx.fillStyle = "#0f0";
  ctx.font = "14px monospace";
  ctx.fillText(`FPS: ${fps.toFixed(1)}`, width - 180, 25);
  ctx.fillText(`Time: ${st.toFixed(3)}s`, width - 180, 43);

  const upcoming = notes
    .filter((n) => !n.judged && n.time >= st)
    .sort((a, b) => a.time - b.time)[0];

  if (upcoming)
    ctx.fillText(`NextΔ: ${(upcoming.time - st).toFixed(3)}s`, width - 180, 61);
  else ctx.fillText("NextΔ: ---", width - 180, 61);
}
