/* Project Baguette – Rhythm Engine v8-P (Fixed+MV)
   • ONE tap-to-start overlay (Safari-safe)
   • MP3-compatible auto-chart
   • MV only appears after audio begins playing (with play() call)
   • Debug enabled via ?debug=1
   • Mobile circles +50% larger
*/

////////////////////////////////////////////////////////////
// QUERY DEBUG FLAG
////////////////////////////////////////////////////////////
const DEBUG = new URLSearchParams(location.search).get("debug") === "1";


////////////////////////////////////////////////////////////
// ELEMENTS + CANVAS SETUP
////////////////////////////////////////////////////////////
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const mv = document.getElementById("mv");
const audio = document.getElementById("song");

// iOS-safe hide MV until playback confirmed
mv.style.opacity = "0";
mv.style.display = "none";
mv.style.transition = "opacity 1s ease";

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

const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
// 50% bigger circles on mobile (0.067 * 1.5 ≈ 0.10)
const BASE_R_SCALE = isMobile ? 0.10 : 0.045;


////////////////////////////////////////////////////////////
// CREATE A SINGLE TAP-TO-START OVERLAY
////////////////////////////////////////////////////////////
const startOverlay = document.createElement("div");
startOverlay.style.cssText = `
  position:fixed;
  top:0; left:0;
  width:100vw; height:100vh;
  background:black;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  color:white;
  font-family:Arial Black, sans-serif;
  font-size:32px;
  z-index:99999;
`;
startOverlay.innerHTML = `
  <div style="opacity:0.9">PROJECT BAGUETTE</div>
  <div id="tapText" style="margin-top:20px; font-size:20px; opacity:0.7;">Tap to Start</div>
`;
document.body.appendChild(startOverlay);

// Blink effect
let blink = true;
setInterval(() => {
  blink = !blink;
  const el = document.getElementById("tapText");
  if (el) el.style.opacity = blink ? "0.9" : "0.4";
}, 600);


////////////////////////////////////////////////////////////
// GAME CONSTANTS
////////////////////////////////////////////////////////////
let BPM = 120;
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

let beatPulse = 1;

let audioCtx = null;
let analyser = null;
let beatTimes = [];
let autoChartReady = false;
let nextBeatIndex = 0;


////////////////////////////////////////////////////////////
// INPUT MAPPING
////////////////////////////////////////////////////////////
const LANES = [
  { key: "w", label: "W", color: "#FFD447" },
  { key: "a", label: "A", color: "#47FFA3" },
  { key: "s", label: "S", color: "#FF69B4" },
  { key: "d", label: "D", color: "#6AB4FF" }
];


////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
// SONG TIME (audio clock)
////////////////////////////////////////////////////////////
function getSongTime() {
  if (audio && !isNaN(audio.currentTime)) return audio.currentTime;
  return 0;
}


////////////////////////////////////////////////////////////
// AUTO-CHART ENGINE (MP3 SAFE)
////////////////////////////////////////////////////////////
async function prepareAutoChart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();

  const src = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;

  src.connect(analyser);
  analyser.connect(audioCtx.destination);

  try {
    const resp = await fetch(audio.src);
    const buf = await resp.arrayBuffer();
    const dec = await audioCtx.decodeAudioData(buf);

    const ch = dec.getChannelData(0);
    const sr = dec.sampleRate;

    const frame = 1024;
    const hop = 512;

    const energies = [];

    for (let i = 0; i + frame < ch.length; i += hop) {
      let sum = 0;
      for (let j = 0; j < frame; j++) sum += ch[i + j] ** 2;
      energies.push(Math.sqrt(sum / frame));
    }

    let mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    let threshold = mean * 1.25;
    let lastBeat = -999;
    const minGap = 0.23;

    for (let i = 1; i < energies.length - 1; i++) {
      const e = energies[i];
      if (e > threshold && e > energies[i - 1] && e > energies[i + 1]) {
        const t = (i * hop) / sr;
        if (t - lastBeat >= minGap) {
          beatTimes.push(t);
          lastBeat = t;
        }
      }
    }

    if (beatTimes.length < 4) {
      console.warn("Sparse auto-chart → fallback");
      for (let t = 0; t < dec.duration; t += 0.5) beatTimes.push(t);
    }

    autoChartReady = true;
  } catch (e) {
    console.error("Auto-chart decode fail:", e);
    for (let t = 0; t < 120; t += 0.5) beatTimes.push(t);
    autoChartReady = true;
  }
}


////////////////////////////////////////////////////////////
// NOTE + PARTICLES
////////////////////////////////////////////////////////////
let notes = [];
let particles = [];
let score = 0;
let combo = 0;
let lastHitText = "";
let lastHitTime = 0;

function addParticles(x, y, color) {
  for (let i = 0; i < 14; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 240,
      vy: (Math.random() - 0.5) * 240,
      life: 0.4,
      color
    });
  }
}


////////////////////////////////////////////////////////////
// NOTE GENERATION
////////////////////////////////////////////////////////////
function lerp(a, b, t) { return a + (b - a) * t; }

function createNote(lane, time) {
  const mX = width * 0.15;
  const mY = height * 0.15;

  const tx = mX + Math.random() * (width - mX * 2);
  const ty = mY + Math.random() * (height - mY * 2);

  const cx = width / 2;
  const cy = height / 2;

  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;

  const spawnDist = Math.max(width, height) * 0.45;

  notes.push({
    lane,
    time,
    spawnX: tx - nx * spawnDist,
    spawnY: ty - ny * spawnDist,
    targetX: tx,
    targetY: ty,
    judged: false,
    effect: "none",
    effectTime: 0,
    shakeSeed: Math.random() * Math.PI * 2
  });
}

function generateNotes(t) {
  if (!autoChartReady) return;

  while (nextBeatIndex < beatTimes.length &&
         beatTimes[nextBeatIndex] < t + SPAWN_LOOKAHEAD) {

    if (notes.filter(n => !n.judged).length >= 4) break;

    createNote(
      Math.floor(Math.random() * LANES.length),
      beatTimes[nextBeatIndex]
    );

    nextBeatIndex++;
  }
}


////////////////////////////////////////////////////////////
// INPUT
////////////////////////////////////////////////////////////
const keysDown = new Set();

window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (!keysDown.has(k)) {
    keysDown.add(k);
    handleKey(k);
  }
});
window.addEventListener("keyup", e => keysDown.delete(e.key.toLowerCase()));

function handleKey(key) {
  const lane = LANES.findIndex(l => l.key === key);
  if (lane === -1) return;

  const t = getSongTime();
  let best = null;
  let diff = Infinity;

  for (const n of notes) {
    if (!n.judged && n.lane === lane) {
      const d = Math.abs(n.time - t);
      if (d < diff) { diff = d; best = n; }
    }
  }

  if (best) judge(best, t);
}

canvas.addEventListener("mousedown", e => {
  const r = canvas.getBoundingClientRect();
  hitAt((e.clientX - r.left) * (canvas.width / r.width),
        (e.clientY - r.top) * (canvas.height / r.height));
});

canvas.addEventListener("touchstart", e => {
  const r = canvas.getBoundingClientRect();
  const t = e.touches[0];
  hitAt((t.clientX - r.left) * (canvas.width / r.width),
        (t.clientY - r.top) * (canvas.height / r.height));
  e.preventDefault();
}, { passive:false });

function hitAt(x, y) {
  const t = getSongTime();
  const r = Math.min(width, height) * BASE_R_SCALE;

  let best = null;
  let scoreVal = Infinity;

  for (const n of notes) {
    if (n.judged) continue;

    const dx = x - n.targetX;
    const dy = y - n.targetY;
    const dist = Math.hypot(dx, dy);

    if (dist > r * 1.2) continue;

    const td = Math.abs(n.time - t);
    const val = td + dist / 1000;

    if (val < scoreVal) {
      scoreVal = val;
      best = n;
    }
  }

  if (best) judge(best, t);
}


////////////////////////////////////////////////////////////
// JUDGE
////////////////////////////////////////////////////////////
function judge(n, t) {
  const d = Math.abs(n.time - t);

  if (d <= HIT_WINDOW_PERFECT) registerHit(n, "COOL", 300);
  else if (d <= HIT_WINDOW_GOOD) registerHit(n, "FINE", 100);
  else if (d <= 0.35) registerMiss(n);
}

function registerHit(n, label, baseScore) {
  n.judged = true;
  n.effect = "hit";
  n.effectTime = getSongTime();

  combo++;
  score += Math.floor(baseScore * (1 + combo * 0.05));

  lastHitText = label;
  lastHitTime = getSongTime();

  addParticles(n.targetX, n.targetY, LANES[n.lane].color);
}

function registerMiss(n) {
  n.judged = true;
  n.effect = "miss";
  n.effectTime = getSongTime();

  combo = 0;
  lastHitText = "MISS";
  lastHitTime = getSongTime();
}


////////////////////////////////////////////////////////////
// RENDER
////////////////////////////////////////////////////////////
let fps = 0;
let lastFrame = performance.now();

function draw(t) {
  ctx.clearRect(0,0,width,height);

  const bp = (t % BEAT) / BEAT;
  beatPulse = 0.5 + 0.5 * Math.sin(bp * Math.PI * 2);

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0,0,width,height);

  const r = Math.min(width, height) * BASE_R_SCALE;

  // Ghosts
  for (const n of notes) {
    ctx.save();
    ctx.globalAlpha = 0.18 + beatPulse * 0.22;
    ctx.strokeStyle = LANES[n.lane].color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(n.targetX, n.targetY, r * 0.9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.05 + 0.10 * beatPulse;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(n.targetX, n.targetY, r * (0.7 + 0.3 * beatPulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Notes
  for (const n of notes) {
    const dt = n.time - t;
    const prog = 1 - dt / smoothedApproach;

    if (!n.judged) {
      if (prog < 0 || prog > 1.5) continue;

      const x = lerp(n.spawnX, n.targetX, prog);
      const y = lerp(n.spawnY, n.targetY, prog);

      // Trail
      const dx = n.targetX - n.spawnX;
      const dy = n.targetY - n.spawnY;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;

      ctx.save();
      ctx.globalAlpha = 0.25 + 0.15 * beatPulse;
      ctx.strokeStyle = LANES[n.lane].color;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - nx * 130, y - ny * 130);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();

      // Body
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.strokeStyle = LANES[n.lane].color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = LANES[n.lane].color;
      ctx.font = `${r * 1.2}px Arial Black`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(LANES[n.lane].label, x, y + r * 0.05);
      ctx.restore();
    }

    else {
      const age = t - n.effectTime;

      if (n.effect === "hit" && age <= HIT_FADE_TIME) {
        ctx.save();
        const p = age / HIT_FADE_TIME;
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = LANES[n.lane].color;
        ctx.beginPath();
        ctx.arc(n.targetX, n.targetY, r * (1 + p * 2.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      else if (n.effect === "miss" && age <= MISS_FADE_TIME) {
        const shake = Math.sin(age * MISS_SHAKE_FREQ * Math.PI * 2 + n.shakeSeed) * MISS_SHAKE_AMT;

        ctx.globalAlpha = 1 - age / MISS_FADE_TIME;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.strokeStyle = LANES[n.lane].color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(n.targetX + shake, n.targetY + age * MISS_FALL_SPEED, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }

  // Particles
  for (let p of particles) {
    p.life -= 1/60;
    p.x += p.vx / 60;
    p.y += p.vy / 60;

    ctx.globalAlpha = Math.max(0, p.life / 0.4) * (0.5 + 0.5 * beatPulse);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  }
  particles = particles.filter(p => p.life > 0);

  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle = "#fff";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Project Baguette", 20, 30);
  ctx.fillText("Score: " + score, 20, 55);
  ctx.fillText("Combo: " + combo, 20, 80);

  if (t - lastHitTime < 0.5 && lastHitText) {
    ctx.font = "32px Arial Black";
    ctx.textAlign = "center";
    ctx.fillText(lastHitText, width/2, height * 0.2);
  }

  if (DEBUG) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(width - 200, 10, 180, 100);

    ctx.fillStyle = "#0f0";
    ctx.font = "14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`FPS: ${fps.toFixed(1)}`, width - 190, 30);
    ctx.fillText(`Time: ${t.toFixed(3)}s`, width - 190, 50);
    ctx.fillText(`Beats: ${beatTimes.length}`, width - 190, 70);
    ctx.fillText(`Idx: ${nextBeatIndex}`, width - 190, 90);
  }
}


////////////////////////////////////////////////////////////
// MAIN LOOP
////////////////////////////////////////////////////////////
function loop() {
  const now = performance.now();
  fps = 1000 / (now - lastFrame);
  lastFrame = now;

  const t = getSongTime();

  const active = notes.filter(n => !n.judged).length;
  smoothedApproach = lerp(smoothedApproach, APPROACH_TIME + active * 0.12, 0.18);

  generateNotes(t);
  draw(t);

  for (const n of notes) {
    if (!n.judged && t > n.time + HIT_WINDOW_GOOD + MISS_EXTRA) {
      registerMiss(n);
    }
  }

  notes = notes.filter(n => {
    if (!n.judged) return true;
    const age = t - n.effectTime;
    if (n.effect === "hit") return age <= HIT_FADE_TIME;
    if (n.effect === "miss") return age <= MISS_FADE_TIME;
    return false;
  });

  requestAnimationFrame(loop);
}


////////////////////////////////////////////////////////////
// TAP START HANDLER (with MV playback)
////////////////////////////////////////////////////////////
startOverlay.addEventListener("click", async () => {

  startOverlay.style.transition = "opacity 0.4s ease";
  startOverlay.style.opacity = "0";
  setTimeout(() => startOverlay.remove(), 450);

  // AudioContext unlock
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") {
    try { await audioCtx.resume(); } catch(e) {}
  }

  // Build auto-chart BEFORE playing audio
  try { await prepareAutoChart(); }
  catch (e) { console.warn("Auto-chart early fail:", e); }

  // Try to start audio
  try { await audio.play(); }
  catch(e) {
    alert("Tap again — Safari blocked audio.");
    return;
  }

  // MV playback helper
  const startMV = () => {
    mv.style.display = "block";
    requestAnimationFrame(() => { mv.style.opacity = "1"; });

    try {
      mv.currentTime = 0;
      const p = mv.play();
      if (p && p.catch) {
        p.catch(err => console.warn("MV play blocked:", err));
      }
    } catch (err) {
      console.warn("MV play() error:", err);
    }
  };

  if (mv.readyState >= 2) {
    startMV();
  } else {
    mv.addEventListener("loadeddata", startMV, { once: true });
  }

  // Begin game
  requestAnimationFrame(loop);
});
