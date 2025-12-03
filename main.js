/* Project Baguette – Rhythm Engine v8-P
   Fixes:
   • Tap-to-start UI (required for iOS AudioContext unlock)
   • MP3-compatible auto-charting
   • MV video stays hidden + paused until audio actually starts
   • Debug via ?debug=1 only
*/

////////////////////////////////////////////////////////////
// TINY TAP-TO-START OVERLAY
////////////////////////////////////////////////////////////
const startOverlay = document.createElement("div");
startOverlay.style.position = "fixed";
startOverlay.style.top = 0;
startOverlay.style.left = 0;
startOverlay.style.width = "100vw";
startOverlay.style.height = "100vh";
startOverlay.style.background = "black";
startOverlay.style.display = "flex";
startOverlay.style.flexDirection = "column";
startOverlay.style.alignItems = "center";
startOverlay.style.justifyContent = "center";
startOverlay.style.color = "white";
startOverlay.style.fontFamily = "Arial Black, sans-serif";
startOverlay.style.fontSize = "32px";
startOverlay.style.zIndex = 9999;
startOverlay.innerHTML = `
  <div style="opacity:0.9">PROJECT BAGUETTE</div>
  <div id="tapText" style="margin-top:20px; font-size:20px; opacity:0.7;">Tap to Start</div>
`;
document.body.appendChild(startOverlay);

let tapBlink = true;
setInterval(() => {
  tapBlink = !tapBlink;
  const el = document.getElementById("tapText");
  if (el) el.style.opacity = tapBlink ? "0.9" : "0.4";
}, 600);


////////////////////////////////////////////////////////////
// DEBUG FLAG
////////////////////////////////////////////////////////////
const DEBUG = window.location.search.includes("debug=1");


////////////////////////////////////////////////////////////
// CANVAS + CORE SETUP
////////////////////////////////////////////////////////////
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

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
const BASE_R_SCALE = isMobile ? 0.067 : 0.045;


////////////////////////////////////////////////////////////
// ELEMENT REFERENCES
////////////////////////////////////////////////////////////
const audio = document.getElementById("song");
const mv = document.getElementById("mv");

// Hide MV until audio actually starts
mv.style.opacity = "0";
mv.style.transition = "opacity 0.8s ease";


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

function lerp(a, b, t) { return a + (b - a) * t; }


////////////////////////////////////////////////////////////
// GET SONG TIME (audio clock > performance.now)
////////////////////////////////////////////////////////////
function getSongTime() {
  if (audio && !isNaN(audio.currentTime)) return audio.currentTime;
  return 0;
}


////////////////////////////////////////////////////////////
// AUTO-CHART ENGINE (MP3-compatible)
////////////////////////////////////////////////////////////
async function prepareAutoChart() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContext();

  const srcNode = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  srcNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  try {
    const resp = await fetch(audio.src);
    const arrayBuf = await resp.arrayBuffer();

    const buffer = await audioCtx.decodeAudioData(arrayBuf);

    // Extract energy envelope
    const channel = buffer.getChannelData(0);
    const sr = buffer.sampleRate;

    const frame = 1024;
    const hop = 512;
    const energies = [];

    for (let i = 0; i + frame < channel.length; i += hop) {
      let sum = 0;
      for (let j = 0; j < frame; j++) sum += channel[i + j] * channel[i + j];
      energies.push(Math.sqrt(sum / frame));
    }

    let mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const threshold = mean * 1.25;
    const minBeatInterval = 0.23;

    let lastBeat = -999;

    for (let i = 1; i < energies.length - 1; i++) {
      const e = energies[i];
      if (e > threshold && e > energies[i - 1] && e > energies[i + 1]) {
        const time = (i * hop) / sr;
        if (time - lastBeat >= minBeatInterval) {
          beatTimes.push(time);
          lastBeat = time;
        }
      }
    }

    if (beatTimes.length < 4) {
      console.warn("Auto-chart too sparse, falling back to metronome grid.");
      for (let t = 0; t < buffer.duration; t += 0.5) beatTimes.push(t);
    }

    autoChartReady = true;

  } catch (err) {
    console.error("decodeAudioData failed:", err);
    beatTimes = [];
    for (let t = 0; t < 120; t += 0.5) beatTimes.push(t); // fallback grid
    autoChartReady = true;
  }
}


////////////////////////////////////////////////////////////
// NOTE + PARTICLE OBJECTS
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
      x,
      y,
      vx: (Math.random() - 0.5) * 240,
      vy: (Math.random() - 0.5) * 240,
      life: 0.40,
      color
    });
  }
}


////////////////////////////////////////////////////////////
// NOTE SPAWNING
////////////////////////////////////////////////////////////
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


function generateNotes(songTime) {
  if (!autoChartReady) return;

  const look = SPAWN_LOOKAHEAD;

  while (nextBeatIndex < beatTimes.length &&
         beatTimes[nextBeatIndex] < songTime + look) {

    const active = notes.filter(n => !n.judged).length;
    if (active >= 4) break;

    const hitTime = beatTimes[nextBeatIndex];
    const lane = Math.floor(Math.random() * LANES.length);

    createNote(lane, hitTime);
    nextBeatIndex++;
  }
}


////////////////////////////////////////////////////////////
// INPUT HANDLING (unchanged from V8)
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
  const laneIndex = LANES.findIndex(l => l.key === key);
  if (laneIndex === -1) return;

  const st = getSongTime();
  let best = null;
  let bd = Infinity;

  for (const n of notes) {
    if (!n.judged && n.lane === laneIndex) {
      const d = Math.abs(n.time - st);
      if (d < bd) { bd = d; best = n; }
    }
  }

  if (best) judge(best, st);
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

function handleMouseHit(x, y) {
  const st = getSongTime();
  const r = Math.min(width, height) * BASE_R_SCALE;

  let best = null;
  let score = Infinity;

  for (const n of notes) {
    if (n.judged) continue;

    const dx = x - n.targetX;
    const dy = y - n.targetY;
    const dist = Math.hypot(dx, dy);
    if (dist > r * 1.2) continue;

    const td = Math.abs(n.time - st);
    const val = td + dist / 1000;

    if (val < score) {
      score = val;
      best = n;
    }
  }

  if (best) judge(best, st);
}


////////////////////////////////////////////////////////////
// HIT / MISS LOGIC
////////////////////////////////////////////////////////////
function judge(n, st) {
  const diff = Math.abs(n.time - st);

  if (diff <= HIT_WINDOW_PERFECT) registerHit(n, "COOL", 300);
  else if (diff <= HIT_WINDOW_GOOD) registerHit(n, "FINE", 100);
  else if (diff <= 0.35) registerMiss(n);
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
// RENDERING (unchanged except video opacity)
////////////////////////////////////////////////////////////
let fps = 0;
let lastFrame = performance.now();

function draw(st) {
  ctx.clearRect(0, 0, width, height);

  const beatPh = (st % BEAT) / BEAT;
  beatPulse = 0.5 + 0.5 * Math.sin(beatPh * Math.PI * 2);

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
    const dt = n.time - st;
    const t = 1 - dt / smoothedApproach;

    if (!n.judged) {
      if (t < 0 || t > 1.5) continue;

      const x = lerp(n.spawnX, n.targetX, t);
      const y = lerp(n.spawnY, n.targetY, t);

      // Trail
      const dx = n.targetX - n.spawnX;
      const dy = n.targetY - n.spawnY;
      const l = Math.hypot(dx, dy) || 1;
      const nx = dx / l;
      const ny = dy / l;

      const tx = x - nx * 130;
      const ty = y - ny * 130;

      ctx.save();
      ctx.globalAlpha = 0.25 + 0.15 * beatPulse;
      ctx.strokeStyle = LANES[n.lane].color;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tx, ty);
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

    // Hit / Miss FX
    else {
      const age = st - n.effectTime;

      if (n.effect === "hit" && age <= HIT_FADE_TIME) {
        ctx.save();
        const prog = age / HIT_FADE_TIME;
        const rr = r * (1 + prog * 2.2);
        ctx.globalAlpha = 1 - prog;
        ctx.fillStyle = LANES[n.lane].color;
        ctx.beginPath();
        ctx.arc(n.targetX, n.targetY, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      else if (n.effect === "miss" && age <= MISS_FADE_TIME) {
        const shake = Math.sin(age * MISS_SHAKE_FREQ * Math.PI * 2 + n.shakeSeed) * MISS_SHAKE_AMT;
        const yy = n.targetY + age * MISS_FALL_SPEED;

        ctx.globalAlpha = 1 - age / MISS_FADE_TIME;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.strokeStyle = LANES[n.lane].color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(n.targetX + shake, yy, r, 0, Math.PI * 2);
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

  // HUD
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  ctx.font = "18px Arial";
  ctx.fillText("Project Baguette", 20, 30);
  ctx.fillText("Score: " + score, 20, 55);
  ctx.fillText("Combo: " + combo, 20, 80);

  if (st - lastHitTime < 0.5 && lastHitText) {
    ctx.font = "32px Arial Black";
    ctx.textAlign = "center";
    ctx.fillText(lastHitText, width/2, height * 0.2);
  }

  // Debug box
  if (DEBUG) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(width - 200, 10, 180, 100);

    ctx.fillStyle = "#0f0";
    ctx.font = "14px monospace";
    ctx.fillText(`FPS: ${fps.toFixed(1)}`, width - 190, 30);
    ctx.fillText(`Time: ${st.toFixed(3)}s`, width - 190, 50);
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

  const st = getSongTime();

  const active = notes.filter(n => !n.judged).length;
  smoothedApproach = lerp(smoothedApproach, APPROACH_TIME + active * 0.12, 0.18);

  generateNotes(st);
  draw(st);

  for (const n of notes) {
    if (!n.judged && st > n.time + HIT_WINDOW_GOOD + MISS_EXTRA) {
      registerMiss(n);
    }
  }

  notes = notes.filter(n => {
    if (!n.judged) return true;
    const age = st - n.effectTime;
    if (n.effect === "hit") return age <= HIT_FADE_TIME;
    if (n.effect === "miss") return age <= MISS_FADE_TIME;
    return false;
  });

  requestAnimationFrame(loop);
}


////////////////////////////////////////////////////////////
// TAP TO START → UNLOCK AUDIO → LOAD CHART → START GAME
////////////////////////////////////////////////////////////
startOverlay.addEventListener("click", async () => {
  startOverlay.style.opacity = "0";
  startOverlay.style.transition = "opacity 0.4s ease";
  setTimeout(() => startOverlay.remove(), 500);

  // Unlock audio context
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") await audioCtx.resume();

  await prepareAutoChart();

  // Begin audio once ready
  audio.play().then(() => {
    // fade-in MV only after audio actually starts
    mv.style.opacity = "1";
  });

  requestAnimationFrame(loop);
});
