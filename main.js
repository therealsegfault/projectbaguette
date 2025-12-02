// -------------------- CONFIG ----------------------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

const LANES = [
  { key: "w", name: "Drums",  color: "#ffdd33", dirChar: "↑" },
  { key: "a", name: "Bass",   color: "#33ff88", dirChar: "←" },
  { key: "s", name: "Lead",   color: "#ff66aa", dirChar: "↓" },
  { key: "d", name: "Keys",   color: "#55aaff", dirChar: "→" },
];

// Travel time from spawn → target
const APPROACH_TIME = 2.2;

// Timing windows (a bit forgiving for laptop keys)
const HIT_WINDOW_PERFECT = 0.08; // 80 ms
const HIT_WINDOW_GOOD    = 0.18; // 180 ms

// Effect durations
const HIT_FADE_TIME  = 0.4;
const MISS_FADE_TIME = 0.6;
const MISS_FALL_SPEED = 220;   // px/s downward
const MISS_SHAKE_AMT   = 10;   // px side-to-side
const MISS_SHAKE_FREQ  = 14;   // oscillations per second

// Internal clock for now (will be tied to WebAudio later)
let startTime = performance.now() / 1000;
let running = true;

// Notes: each gets random target+spawn, plus FX fields
let notes = [
  { time: 1.0, lane: 0 },
  { time: 1.4, lane: 1 },
  { time: 1.8, lane: 2 },
  { time: 2.2, lane: 3 },
  { time: 2.6, lane: 0 },
  { time: 3.0, lane: 1 },
  { time: 3.4, lane: 2 },
  { time: 3.8, lane: 3 },
].map(n => ({
  ...n,
  hit: false,
  judged: false,
  effect: "none",   // "none" | "hit" | "miss"
  effectTime: 0,
  missOffset: 0,
  shakeSeed: Math.random() * Math.PI * 2,
  spawnX: 0,
  spawnY: 0,
  targetX: 0,
  targetY: 0,
}));

let score = 0;
let combo = 0;
let lastHitText = "";
let lastHitTime = 0;

let lastFrameTime = performance.now();
let fps = 0;

// -------------------- LAYOUT ----------------------
function assignNotePaths() {
  const cx = width / 2;
  const cy = height / 2;
  const marginX = width * 0.12;
  const marginY = height * 0.12;
  const spawnDist = Math.max(width, height) * 0.7;

  for (const note of notes) {
    // random target not too close to edges
    const tx = marginX + Math.random() * (width - marginX * 2);
    const ty = marginY + Math.random() * (height - marginY * 2);

    const dx = tx - cx;
    const dy = ty - cy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    // spawn behind the target along the line from center
    const sx = tx - nx * spawnDist;
    const sy = ty - ny * spawnDist;

    note.targetX = tx;
    note.targetY = ty;
    note.spawnX = sx;
    note.spawnY = sy;
  }
}

function updateLayout() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  assignNotePaths();
}

window.addEventListener("resize", updateLayout);
updateLayout();

// -------------------- TIMING ----------------------
function getSongTime() {
  if (!running) return 0;
  return performance.now() / 1000 - startTime;
}

// -------------------- INPUT (WASD) ----------------
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

  const songTime = getSongTime();

  // closest unjudged note in that lane
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
    registerHit(bestNote, "COOL", 300);   // Diva-ish wording
  } else if (bestDiff <= HIT_WINDOW_GOOD) {
    registerHit(bestNote, "FINE", 100);
  } else {
    // too early/late: optional strict miss
    // registerMiss(bestNote);
  }
}

function registerHit(note, label, baseScore) {
  const t = getSongTime();
  note.hit = true;
  note.judged = true;
  note.effect = "hit";
  note.effectTime = t;

  combo += 1;
  const mult = 1 + combo * 0.05;
  score += Math.floor(baseScore * mult);

  lastHitText = label;
  lastHitTime = t;
}

function registerMiss(note) {
  const t = getSongTime();
  note.hit = false;
  note.judged = true;
  note.effect = "miss";
  note.effectTime = t;
  note.missOffset = 0;

  combo = 0;
  lastHitText = "MISS";
  lastHitTime = t;
}

// -------------------- GAME LOOP -------------------
function loop() {
  if (!running) return;
  const now = performance.now();
  const deltaMs = now - lastFrameTime;
  lastFrameTime = now;
  fps = 1000 / deltaMs;

  const songTime = getSongTime();

  // auto-miss when the good window is gone
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

function drawDiamondNote(x, y, radius, laneIndex, isMiss) {
  const lane = LANES[laneIndex];
  const mainColor = isMiss ? "#ff4466" : lane.color;
  const borderColor = "#ffffff";

  const side = radius * 1.9;

  // diamond
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4); // square → diamond

  ctx.fillStyle = mainColor;
  ctx.fillRect(-side / 2, -side / 2, side, side);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(-side / 2, -side / 2, side, side);

  ctx.restore();

  // arrow symbol
  ctx.fillStyle = "#000";
  ctx.font = `${Math.floor(radius * 1.1)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(lane.dirChar, x, y);
}

function draw(songTime) {
  ctx.clearRect(0, 0, width, height);

  const baseRadius = Math.min(width, height) * 0.045;

  // Slight overlay to make notes pop over MV
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(0, 0, width, height);

  // Notes
  for (const note of notes) {
    let x, y, alpha = 1, radius = baseRadius;
    let showMissText = false;

    if (!note.judged) {
      const dt = note.time - songTime;       // seconds until hit
      const t = 1 - dt / APPROACH_TIME;      // 0→1

      if (t < 0 || t > 1.5) continue;        // off-screen

      x = lerp(note.spawnX, note.targetX, t);
      y = lerp(note.spawnY, note.targetY, t);

    } else if (note.effect === "hit") {
      const age = songTime - note.effectTime;
      if (age > HIT_FADE_TIME) continue;

      const progress = age / HIT_FADE_TIME;
      x = note.targetX + (Math.random() - 0.5) * progress * 10;
      y = note.targetY + (Math.random() - 0.5) * progress * 10;

      radius = baseRadius * (1 - 0.4 * progress);
      alpha = 1 - progress;

    } else if (note.effect === "miss") {
      const age = songTime - note.effectTime;
      if (age > MISS_FADE_TIME) continue;

      const fall = age * MISS_FALL_SPEED;
      const shake = Math.sin(age * MISS_SHAKE_FREQ * Math.PI * 2 + note.shakeSeed) * MISS_SHAKE_AMT;

      x = note.targetX + shake;
      y = note.targetY + fall;

      alpha = 1 - age / MISS_FADE_TIME;
      showMissText = age < 0.4;
    } else {
      continue;
    }

    ctx.globalAlpha = alpha;
    drawDiamondNote(x, y, radius, note.lane, note.effect === "miss");
    ctx.globalAlpha = 1;

    if (showMissText) {
      ctx.fillStyle = "#ff5555";
      ctx.font = "18px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("MISS", x, y - radius * 1.8);
    }
  }

  // HUD
  ctx.fillStyle = "#ffffff";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Project Baguette", 20, 30);
  ctx.fillText("Score: " + score, 20, 55);
  ctx.fillText("Combo: " + combo, 20, 80);

  const st = getSongTime();
  const timeSinceHit = st - lastHitTime;
  if (timeSinceHit < 0.5 && lastHitText) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.fillText(lastHitText, width / 2, height * 0.2);
  }

  // debug
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(width - 190, 10, 180, 70);
  ctx.fillStyle = "#0f0";
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`FPS: ${fps.toFixed(1)}`, width - 180, 25);
  ctx.fillText(`Time: ${st.toFixed(3)}s`, width - 180, 43);
  const nextNote = notes.find(n => !n.judged);
  if (nextNote) {
    const diff = nextNote.time - st;
    ctx.fillText(`NextΔ: ${diff.toFixed(3)}s`, width - 180, 61);
  } else {
    ctx.fillText("NextΔ: ---", width - 180, 61);
  }
}
