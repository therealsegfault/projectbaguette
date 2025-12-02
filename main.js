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

// Make notes move a bit slower so it’s easier to see
const APPROACH_TIME = 2.5;

// Timing windows
const HIT_WINDOW_PERFECT = 0.06; // 60 ms
const HIT_WINDOW_GOOD    = 0.14; // 140 ms

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

// Example notes – you can tweak these times
let notes = [
  { time: 1.0, lane: 0, hit: false, judged: false },
  { time: 1.5, lane: 1, hit: false, judged: false },
  { time: 2.0, lane: 2, hit: false, judged: false },
  { time: 2.5, lane: 3, hit: false, judged: false },
  { time: 3.0, lane: 0, hit: false, judged: false },
  { time: 3.5, lane: 1, hit: false, judged: false },
  { time: 4.0, lane: 2, hit: false, judged: false },
  { time: 4.5, lane: 3, hit: false, judged: false },
];

let score = 0;
let combo = 0;
let lastHitText = "";
let lastHitTime = 0;

// For visual feedback when you press a key
let lanePulse = [0, 0, 0, 0]; // seconds since last press per lane

// Debug info
let lastFrameTime = performance.now();
let fps = 0;

// -------------------- TIMING ----------------------
function getSongTime() {
  if (!running) return 0;
  return performance.now() / 1000 - startTime;
}

// -------------------- INPUT -----------------------
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

  lanePulse[laneIndex] = 0; // reset pulse timer

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
    // too early / late
    // registerMiss(bestNote); // uncomment if you want strictness
  }
}

function registerHit(note, label, baseScore) {
  note.hit = true;
  note.judged = true;
  combo += 1;
  const multiplier = 1 + combo * 0.05;
  score += Math.floor(baseScore * multiplier);

  lastHitText = label;
  lastHitTime = getSongTime();
}

function registerMiss(note) {
  note.hit = false;
  note.judged = true;
  combo = 0;
  lastHitText = "MISS";
  lastHitTime = getSongTime();
}

// -------------------- GAME LOOP -------------------
function loop() {
  if (!running) return;
  const now = performance.now();
  const deltaMs = now - lastFrameTime;
  lastFrameTime = now;
  fps = 1000 / deltaMs;

  const songTime = getSongTime();

  // update lane pulses (for target flashes)
  for (let i = 0; i < lanePulse.length; i++) {
    lanePulse[i] += deltaMs / 1000;
  }

  // auto-judge misses
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

  // draw targets
  for (let i = 0; i < LANES.length; i++) {
    const lane = LANES[i];
    const tpos = TARGETS[i];

    // pulse when pressed
    const pulseAge = lanePulse[i];
    const pulseFactor = Math.max(0, 1.0 - pulseAge * 4); // fades in ~0.25s
    const outerR = targetRadius * (1 + 0.25 * pulseFactor);

    // outer ring
    ctx.lineWidth = 4;
    ctx.strokeStyle = lane.color;
    ctx.beginPath();
    ctx.arc(tpos.x, tpos.y, outerR, 0, Math.PI * 2);
    ctx.stroke();

    // inner circle
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath();
    ctx.arc(tpos.x, tpos.y, targetRadius * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // direction symbol
    ctx.fillStyle = lane.color;
    ctx.font = `${Math.floor(targetRadius * 0.7)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lane.dirChar, tpos.x, tpos.y);
  }

  // draw notes
  const noteRadius = targetRadius * 0.6;

  for (const note of notes) {
    const dt = note.time - songTime; // seconds until hit
    const t = 1 - dt / APPROACH_TIME; // 0 (spawn) → 1 (target)

    if (t < 0 || t > 1.5) continue;

    const laneIndex = note.lane;
    const spawn = SPAWNS[laneIndex];
    const target = TARGETS[laneIndex];

    const x = lerp(spawn.x, target.x, t);
    const y = lerp(spawn.y, target.y, t);

    let alpha = 1.0;
    if (note.judged && !note.hit) alpha = 0.2;
    if (note.hit) alpha = 0.5;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = LANES[laneIndex].color;
    ctx.beginPath();
    ctx.arc(x, y, noteRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#000";
    ctx.font = `${Math.floor(noteRadius)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(LANES[laneIndex].dirChar, x, y);
    ctx.globalAlpha = 1.0;
  }

  // HUD: score + combo
  ctx.fillStyle = "#fff";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Score: " + score, 20, 30);
  ctx.fillText("Combo: " + combo, 20, 55);

  // last hit feedback
  const timeSinceHit = songTime - lastHitTime;
  if (timeSinceHit < 0.5 && lastHitText) {
    ctx.fillStyle = "#fff";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lastHitText, width / 2, height * 0.2);
  }

  // DEBUG OVERLAY (top-right)
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(width - 180, 10, 170, 70);

  ctx.fillStyle = "#0f0";
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.fillText(`FPS: ${fps.toFixed(1)}`, width - 170, 18);
  ctx.fillText(`Time: ${songTime.toFixed(3)}s`, width - 170, 36);

  // show diff to next note
  const nextNote = notes.find(n => !n.judged);
  if (nextNote) {
    const diff = nextNote.time - songTime;
    ctx.fillText(`NextΔ: ${diff.toFixed(3)}s`, width - 170, 54);
  } else {
    ctx.fillText("NextΔ: ---", width - 170, 54);
  }
}
