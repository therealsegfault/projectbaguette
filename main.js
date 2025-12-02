// -------------------- CONFIG ----------------------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

const LANES = [
  { key: "w", name: "Drums",  color: "#ff5555", dirChar: "↑" },
  { key: "a", name: "Bass",   color: "#55ff55", dirChar: "←" },
  { key: "s", name: "Lead",   color: "#ffaa00", dirChar: "↓" },
  { key: "d", name: "Keys",   color: "#5555ff", dirChar: "→" },
];

// Travel time from spawn → target
const APPROACH_TIME = 2.5;

// Timing windows
const HIT_WINDOW_PERFECT = 0.08; // 80 ms
const HIT_WINDOW_GOOD    = 0.18; // 180 ms

// Effect durations
const HIT_FADE_TIME  = 0.4;
const MISS_FADE_TIME = 0.6;
const MISS_FALL_SPEED = 220;   // px/s downward
const MISS_SHAKE_AMT   = 10;   // px side-to-side
const MISS_SHAKE_FREQ  = 14;   // oscillations per second

// Layout positions
let TARGETS = [];
let SPAWNS = [];

function updateLayout() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.25;

  TARGETS = [
    { x: cx,        y: cy - radius }, // Up (W)
    { x: cx - radius, y: cy },        // Left (A)
    { x: cx,        y: cy + radius }, // Down (S)
    { x: cx + radius, y: cy },        // Right (D)
  ];

  const spawnOffset = radius * 1.5;
  SPAWNS = [
    { x: cx,        y: cy - radius - spawnOffset },
    { x: cx - radius - spawnOffset, y: cy },
    { x: cx,        y: cy + radius + spawnOffset },
    { x: cx + radius + spawnOffset, y: cy },
  ];
}

window.addEventListener("resize", updateLayout);
updateLayout();

// Simple internal clock for now
let startTime = performance.now() / 1000;
let running = true;

// Notes: add effect fields
let notes = [
  { time: 1.0, lane: 0, hit: false, judged: false, effect: "none", effectTime: 0, missOffset: 0, shakeSeed: 0 },
  { time: 1.5, lane: 1, hit: false, judged: false, effect: "none", effectTime: 0, missOffset: 0, shakeSeed: 0 },
  { time: 2.0, lane: 2, hit: false, judged: false, effect: "none", effectTime: 0, missOffset: 0, shakeSeed: 0 },
  { time: 2.5, lane: 3, hit: false, judged: false, effect: "none", effectTime: 0, missOffset: 0, shakeSeed: 0 },
  { time: 3.0, lane: 0, hit: false, judged: false, effect: "none", effectTime: 0, missOffset: 0, shakeSeed: 0 },
  { time: 3.5, lane: 1, hit: false, judged: false, effect: "none", effectTime: 0, missOffset: 0, shakeSeed: 0 },
  { time: 4.0, lane: 2, hit: false, judged: false, effect: "none", effectTime: 0, missOffset: 0, shakeSeed: 0 },
  { time: 4.5, lane: 3, hit: false, judged: false, effect: "none", effectTime: 0, missOffset: 0, shakeSeed: 0 },
];

let score = 0;
let combo = 0;
let lastHitText = "";
let lastHitTime = 0;

// Target flash when pressed
let lanePulse = [0, 0, 0, 0];

// Debug
let lastFrameTime = performance.now();
let fps = 0;

// -------------------- TIMING ----------------------
function getSongTime() {
  if (!running) return 0;
  return performance.now() / 1000 - startTime;
}

// -------------------- INPUT (WASD stays) ----------
const keysDown = new Set();

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (!keysDown.has(key)) {
    keysDown.add(key);
    handleKeyPress(key);
  }
});

window.addEventListener("keyup", (e) => {
  keysDown.delete(e.key.toLowerCase());
});

function handleKeyPress(key) {
  const laneIndex = LANES.findIndex(l => l.key === key);
  if (laneIndex === -1) return;

  lanePulse[laneIndex] = 0;

  const songTime = getSongTime();
  let bestNote = null;
  let bestDiff = Infinity;

  for (const note of notes) {
    if (note.judged || note.lane !== laneIndex) continue;
    const diff = Math.abs(note.time - songTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestNote = note;
    }
  }

  if (!bestNote) return;

  if (bestDiff <= HIT_WINDOW_PERFECT) {
    registerHit(bestNote, "PERFECT", 300);
  } else if (bestDiff <= HIT_WINDOW_GOOD) {
    registerHit(bestNote, "GOOD", 100);
  } else {
    // optional strict miss on bad timing:
    // registerMiss(bestNote);
  }
}

function registerHit(note, label, baseScore) {
  const songTime = getSongTime();
  note.hit = true;
  note.judged = true;
  note.effect = "hit";
  note.effectTime = songTime;

  combo += 1;
  const multiplier = 1 + combo * 0.05;
  score += Math.floor(baseScore * multiplier);

  lastHitText = label;
  lastHitTime = songTime;
}

function registerMiss(note) {
  const songTime = getSongTime();
  note.hit = false;
  note.judged = true;
  note.effect = "miss";
  note.effectTime = songTime;
  note.missOffset = 0;
  note.shakeSeed = Math.random() * Math.PI * 2;

  combo = 0;
  lastHitText = "MISS";
  lastHitTime = songTime;
}

// -------------------- GAME LOOP -------------------
function loop() {
  if (!running) return;
  const now = performance.now();
  const deltaMs = now - lastFrameTime;
  lastFrameTime = now;
  fps = 1000 / deltaMs;

  const songTime = getSongTime();

  for (let i = 0; i < lanePulse.length; i++) {
    lanePulse[i] += deltaMs / 1000;
  }

  // auto-miss
  for (const note of notes) {
    if (!note.judged && songTime > note.time + HIT_WINDOW_GOOD) {
      registerMiss(note);
    }
  }

  draw(songTime);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// -------------------- RENDERING -------------------
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function draw(songTime) {
  ctx.clearRect(0, 0, width, height);

  // background
  const grd = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.1,
    width / 2, height / 2, Math.min(width, height) * 0.7
  );
  grd.addColorStop(0, "#111");
  grd.addColorStop(1, "#000");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  const targetRadius = Math.min(width, height) * 0.06;

  // Targets
  for (let i = 0; i < LANES.length; i++) {
    const lane = LANES[i];
    const tpos = TARGETS[i];

    const pulseAge = lanePulse[i];
    const pulseFactor = Math.max(0, 1.0 - pulseAge * 4);
    const outerR = targetRadius * (1 + 0.25 * pulseFactor);

    ctx.lineWidth = 4;
    ctx.strokeStyle = lane.color;
    ctx.beginPath();
    ctx.arc(tpos.x, tpos.y, outerR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath();
    ctx.arc(tpos.x, tpos.y, targetRadius * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = lane.color;
    ctx.font = `${Math.floor(targetRadius * 0.7)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lane.dirChar, tpos.x, tpos.y);
  }

  const baseNoteRadius = targetRadius * 0.6;

  // Notes
  for (const note of notes) {
    const laneIndex = note.lane;
    const spawn = SPAWNS[laneIndex];
    const target = TARGETS[laneIndex];

    let x, y, alpha, radius;
    let showMissText = false;

    if (!note.judged) {
      const dt = note.time - songTime;
      const t = 1 - dt / APPROACH_TIME;
      if (t < 0 || t > 1.5) continue;

      x = lerp(spawn.x, target.x, t);
      y = lerp(spawn.y, target.y, t);
      alpha = 1.0;
      radius = baseNoteRadius;

    } else if (note.effect === "hit") {
      const age = songTime - note.effectTime;
      if (age > HIT_FADE_TIME) continue;

      const progress = age / HIT_FADE_TIME;
      const dtAtHit = note.time - note.effectTime;
      const tAtHit = 1 - dtAtHit / APPROACH_TIME;
      const baseX = lerp(spawn.x, target.x, tAtHit);
      const baseY = lerp(spawn.y, target.y, tAtHit);

      const jitter = progress * 6;
      x = baseX + (Math.random() - 0.5) * jitter;
      y = baseY + (Math.random() - 0.5) * jitter;

      radius = baseNoteRadius * (1 - 0.4 * progress);
      alpha = 1.0 - progress;

    } else if (note.effect === "miss") {
      const age = songTime - note.effectTime;
      if (age > MISS_FADE_TIME) continue;

      const dtAtMiss = note.time - note.effectTime;
      const tAtMiss = 1 - dtAtMiss / APPROACH_TIME;
      const baseX = lerp(spawn.x, target.x, tAtMiss);
      const baseY = lerp(spawn.y, target.y, tAtMiss);

      const fall = age * MISS_FALL_SPEED;
      const shake = Math.sin(age * MISS_SHAKE_FREQ * Math.PI * 2 + note.shakeSeed) * MISS_SHAKE_AMT;

      x = baseX + shake;
      y = baseY + fall;

      radius = baseNoteRadius;
      alpha = 1.0 - age / MISS_FADE_TIME;
      showMissText = age < 0.4;
    } else {
      continue;
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = note.effect === "miss" ? "#ff4444" : LANES[laneIndex].color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#000";
    ctx.font = `${Math.floor(radius)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(LANES[laneIndex].dirChar, x, y);
    ctx.globalAlpha = 1.0;

    if (showMissText) {
      ctx.fillStyle = "#ff5555";
      ctx.font = "18px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("MISS", x, y - radius * 1.6);
    }
  }

  // HUD
  ctx.fillStyle = "#fff";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Score: " + score, 20, 30);
  ctx.fillText("Combo: " + combo, 20, 55);

  const songTimeNow = getSongTime();
  const timeSinceHit = songTimeNow - lastHitTime;
  if (timeSinceHit < 0.5 && lastHitText) {
    ctx.fillStyle = "#fff";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.fillText(lastHitText, width / 2, height * 0.2);
  }

  // Debug (top-right)
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(width - 190, 10, 180, 70);
  ctx.fillStyle = "#0f0";
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`FPS: ${fps.toFixed(1)}`, width - 180, 22);
  ctx.fillText(`Time: ${songTimeNow.toFixed(3)}s`, width - 180, 40);
  const nextNote = notes.find(n => !n.judged);
  if (nextNote) {
    const diff = nextNote.time - songTimeNow;
    ctx.fillText(`NextΔ: ${diff.toFixed(3)}s`, width - 180, 58);
  } else {
    ctx.fillText("NextΔ: ---", width - 180, 58);
  }
}
