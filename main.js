/* Project Baguette – Rhythm Engine v7.1 (Optimized)
   Improvements:
   A: activeNotes cached per frame
   B: Smoothed adaptive approach time (Diva-like motion)
   C: Clean hit/miss logic
   D: Mobile circle scale +50%
*/

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Screen setup
let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

window.addEventListener("resize", () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
});

// ========= MOBILE DETECTION =========
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
const BASE_R_SCALE = isMobile ? 0.067 : 0.045;

// ========= LANES =========
const LANES = [
  { key: "w", label: "W", color: "#FFD447" },
  { key: "a", label: "A", color: "#47FFA3" },
  { key: "s", label: "S", color: "#FF69B4" },
  { key: "d", label: "D", color: "#6AB4FF" }
];

// ========= TIMING =========
const BPM = 120;
const BEAT = 60 / BPM;
let APPROACH_TIME = 1.4 + (240 / BPM);
let smoothedApproach = APPROACH_TIME;

const HIT_WINDOW_PERFECT = 0.08;
const HIT_WINDOW_GOOD = 0.18;

const SPAWN_LOOKAHEAD = 8.0;
const MISS_EXTRA = 0.20;

const HIT_FADE_TIME = 0.4;
const MISS_FADE_TIME = 0.6;
const MISS_FALL_SPEED = 220;
const MISS_SHAKE_AMT = 10;
const MISS_SHAKE_FREQ = 14;

let startTime = performance.now() / 1000;

let notes = [];
let score = 0;
let combo = 0;
let lastHitText = "";
let lastHitTime = 0;

let nextBeatTime = 1.0;
let beatIndex = 0;

let beatPulse = 1;

// ========= UTILS =========
function getSongTime() {
  return performance.now() / 1000 - startTime;
}
function lerp(a, b, t) { return a + (b - a) * t; }

// ========= PATTERN TABLE =========
const patternTable = [
  [
    [0, null, null, null],
    [1, null, 2, null],
    [null, null, null, null],
    [3, null, null, null],
  ],
  [
    [0, null, 1, null],
    [null, null, 2, null],
    [1, null, null, 3],
    [null, 0, null, null],
  ]
];

// ========= PARTICLES =========
let particles = [];

function addParticles(x, y, color) {
  for (let i = 0; i < 14; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 240,
      vy: (Math.random() - 0.5) * 240,
      life: 0.40,
      color
    });
  }
}

// ========= NOTE GENERATION =========
function createNote(lane, time) {
  const marginX = width * 0.15,
        marginY = height * 0.15;

  const tx = marginX + Math.random() * (width - marginX * 2);
  const ty = marginY + Math.random() * (height - marginY * 2);

  const cx = width / 2,
        cy = height / 2;

  const dx = tx - cx, dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;

  const spawnDist = Math.max(width, height) * 0.45;
  const sx = tx - nx * spawnDist;
  const sy = ty - ny * spawnDist;

  notes.push({
    lane,
    time,
    spawnX: sx,
    spawnY: sy,
    targetX: tx,
    targetY: ty,
    judged: false,
    effect: "none",
    effectTime: 0,
    shakeSeed: Math.random() * Math.PI * 2
  });
}

function generateNotes(songTime) {
  while (nextBeatTime < songTime + SPAWN_LOOKAHEAD) {

    // limit active notes
    const activeNotes = notes.filter(n => !n.judged);
    if (activeNotes.length >= 4) {
      nextBeatTime += BEAT;
      beatIndex++;
      continue;
    }

    const measureIndex = Math.floor(beatIndex / 4) % patternTable.length;
    const beatInMeasure = beatIndex % 4;
    const pattern = patternTable[measureIndex][beatInMeasure];

    for (let sub = 0; sub < 4; sub++) {
      const lane = pattern[sub];
      if (lane !== null) {
        const jitter = (Math.random() * 0.12) - 0.06;
        const t = nextBeatTime + sub * (BEAT / 4) + jitter;
        createNote(lane, t);
      }
    }

    nextBeatTime += BEAT;
    beatIndex++;
  }
}

// ========= INPUT =========
const keysDown = new Set();

window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (!keysDown.has(k)) {
    keysDown.add(k);
    handleKey(k);
  }
});
window.addEventListener("keyup", e => keysDown.delete(e.key.toLowerCase()));

// Mouse/touch combined
function handleMouseHit(x, y) {
  const songTime = getSongTime();
  const baseR = Math.min(width, height) * BASE_R_SCALE;

  let best = null;
  let bestScore = Infinity;

  for (const n of notes) {
    if (n.judged) continue;

    const dx = x - n.targetX;
    const dy = y - n.targetY;
    const dist = Math.hypot(dx, dy);
    if (dist > baseR * 1.2) continue;

    const td = Math.abs(n.time - songTime);
    const score = td + dist / 1000;

    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }

  if (!best) return;
  judgeNote(best, songTime);
}

canvas.addEventListener("mousedown", e => {
  const r = canvas.getBoundingClientRect();
  handleMouseHit(
    (e.clientX - r.left) * (canvas.width / r.width),
    (e.clientY - r.top) * (canvas.height / r.height)
  );
});

canvas.addEventListener("touchstart", e => {
  const r = canvas.getBoundingClientRect();
  const t = e.touches[0];

  handleMouseHit(
    (t.clientX - r.left) * (canvas.width / r.width),
    (t.clientY - r.top) * (canvas.height / r.height)
  );

  e.preventDefault();
}, { passive: false });

canvas.addEventListener("touchmove", e => e.preventDefault(), { passive: false });

// Key hits
function handleKey(key) {
  const laneIndex = LANES.findIndex(l => l.key === key);
  if (laneIndex === -1) return;

  const songTime = getSongTime();
  let best = null, bestDiff = Infinity;

  for (const n of notes) {
    if (!n.judged && n.lane === laneIndex) {
      const d = Math.abs(n.time - songTime);
      if (d < bestDiff) { bestDiff = d; best = n; }
    }
  }

  if (!best) return;
  judgeNote(best, songTime);
}

// Unified judge
function judgeNote(n, songTime) {
  const diff = Math.abs(n.time - songTime);

  if (diff <= HIT_WINDOW_PERFECT) registerHit(n, "COOL", 300);
  else if (diff <= HIT_WINDOW_GOOD) registerHit(n, "FINE", 100);
  else if (diff <= 0.35) registerMiss(n);
}

// ========= VIBRATION =========
function maybeVibrate(p) {
  if (navigator.vibrate) navigator.vibrate(p);
}

function registerHit(n, label, baseScore) {
  const t = getSongTime();
  n.judged = true;
  n.effect = "hit";
  n.effectTime = t;

  combo++;
  score += Math.floor(baseScore * (1 + combo * 0.05));

  lastHitText = label;
  lastHitTime = t;

  addParticles(n.targetX, n.targetY, LANES[n.lane].color);

  if (label === "COOL") maybeVibrate(20);
  else if (label === "FINE") maybeVibrate(10);
}

function registerMiss(n) {
  const t = getSongTime();
  n.judged = true;
  n.effect = "miss";
  n.effectTime = t;

  combo = 0;
  lastHitText = "MISS";
  lastHitTime = t;

  maybeVibrate([10, 40, 10]);
}

// ========= VISUAL HELPERS =========
function drawGhostTarget(note, baseR) {
  const dt = note.time - getSongTime();
  const approach = Math.max(0, Math.min(1, 1 - dt / smoothedApproach));

  ctx.save();
  ctx.globalAlpha = 0.18 + beatPulse * 0.22;
  ctx.strokeStyle = LANES[note.lane].color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(note.targetX, note.targetY, baseR * 0.9, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.05 + 0.10 * beatPulse;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(
    note.targetX,
    note.targetY,
    baseR * (0.7 + 0.3 * beatPulse),
    0,
    Math.PI * 2
  );
  ctx.stroke();
  ctx.restore();
}

function drawTrail(note, x, y) {
  const lane = LANES[note.lane];

  const dx = note.targetX - note.spawnX;
  const dy = note.targetY - note.spawnY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;

  const trailLen = 130;
  const tx = x - nx * trailLen;
  const ty = y - ny * trailLen;

  ctx.save();
  ctx.globalAlpha = 0.25 + 0.15 * beatPulse;
  ctx.strokeStyle = lane.color;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

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
  ctx.restore();
}

// ========= DRAW LOOP =========
function draw(songTime) {
  if (width === 0 || height === 0) return;

  ctx.clearRect(0, 0, width, height);

  // BPM pulse
  const beatPhase = (songTime % BEAT) / BEAT;
  beatPulse = 0.5 + 0.5 * Math.sin(beatPhase * Math.PI * 2);

  // Enforce at most 4 active notes
  const activeSorted = notes
    .filter(n => !n.judged)
    .sort((a, b) => a.time - b.time);

  if (activeSorted.length > 4) {
    const excess = activeSorted.length - 4;
    for (let i = 0; i < excess; i++) registerMiss(activeSorted[i]);
  }

  // semi-transparent black overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fillRect(0, 0, width, height);

  const baseR = Math.min(width, height) * BASE_R_SCALE;

  // ghost targets
  for (const n of notes) {
    drawGhostTarget(n, baseR);
  }

  // notes
  for (const n of notes) {
    const lane = LANES[n.lane];
    const tNow = songTime;

    if (!n.judged) {
      const dt = n.time - tNow;
      const t = 1 - dt / smoothedApproach;
      if (t < 0 || t > 1.5) continue;

      const x = lerp(n.spawnX, n.targetX, t);
      const y = lerp(n.spawnY, n.targetY, t);

      drawTrail(n, x, y);
      drawButtonNote(x, y, baseR, lane);

    } else if (n.effect === "hit") {
      const age = tNow - n.effectTime;
      if (age <= HIT_FADE_TIME) drawHitburst(n, age, baseR);

    } else if (n.effect === "miss") {
      const age = tNow - n.effectTime;
      if (age <= MISS_FADE_TIME) {
        const fall = age * MISS_FALL_SPEED;
        const shake =
          Math.sin(age * MISS_SHAKE_FREQ * Math.PI * 2 + n.shakeSeed) *
          MISS_SHAKE_AMT;

        const x = n.targetX + shake;
        const y = n.targetY + fall;

        ctx.globalAlpha = 1 - age / MISS_FADE_TIME;
        drawButtonNote(x, y, baseR, lane);
        ctx.globalAlpha = 1;
      }
    }
  }

  // particles
  for (let p of particles) {
    p.life -= 1 / 60;
    p.x += p.vx / 60;
    p.y += p.vy / 60;

    ctx.save();
    const alpha = Math.max(0, p.life / 0.4) * (0.5 + 0.5 * beatPulse);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
    ctx.restore();
  }
  particles = particles.filter(p => p.life > 0);

  // HUD — PROJECT BAGUETTE
  ctx.fillStyle = "#fff";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Project Baguette", 20, 30);
  ctx.fillText("Score: " + score, 20, 55);
  ctx.fillText("Combo: " + combo, 20, 80);

  // Hit text
  if (songTime - lastHitTime < 0.5 && lastHitText) {
    ctx.font = "32px Arial Black";
    ctx.textAlign = "center";
    ctx.fillText(lastHitText, width / 2, height * 0.2);
  }

  // FPS + next note
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(width - 190, 10, 180, 70);

  ctx.fillStyle = "#0f0";
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`FPS: ${fps.toFixed(1)}`, width - 180, 25);
  ctx.fillText(`Time: ${songTime.toFixed(3)}s`, width - 180, 43);

  const upcoming = notes
    .filter(n => !n.judged && n.time >= songTime)
    .sort((a, b) => a.time - b.time)[0];

  ctx.fillText(
    `NextΔ: ${upcoming ? (upcoming.time - songTime).toFixed(3) : "---"}`,
    width - 180,
    61
  );
}

// ========= MAIN LOOP =========
let fps = 0;
let lastFrame = performance.now();  

function loop() {
  const now = performance.now();
  fps = 1000 / (now - lastFrame);
  lastFrame = now;

  const t = getSongTime();

  const activeNotes = notes.filter(n => !n.judged);

  // Smoothed approach
  const targetApproach = APPROACH_TIME + activeNotes.length * 0.12;
  smoothedApproach = lerp(smoothedApproach, targetApproach, 0.18);

  generateNotes(t);
  draw(t);

  // Auto-miss
  for (const n of activeNotes) {
    if (t > n.time + HIT_WINDOW_GOOD + MISS_EXTRA) registerMiss(n);
  }

  // Cleanup
  notes = notes.filter(n => {
    if (!n.judged) return true;
    const age = t - n.effectTime;

    if (n.effect === "hit") return age <= HIT_FADE_TIME;
    if (n.effect === "miss") return age <= MISS_FADE_TIME;
    return false;
  });

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
