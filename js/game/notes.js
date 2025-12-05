/* ---------- notes.js ---------- */
import { width, height } from "./core.js";
import { getSongTime, beatTimes, autoChartReady, nextBeatIndex } from "./audio.js";

export let BPM = 120;
export const BEAT = 60 / BPM;

export const LANES = [
  { key: "w", label: "W", color: "#FFD447" },
  { key: "a", label: "A", color: "#47FFA3" },
  { key: "s", label: "S", color: "#FF69B4" },
  { key: "d", label: "D", color: "#6AB4FF" }
];

export let notes = [];
export let particles = [];
export let score = 0;
export let combo = 0;
export let lastHitText = "";
export let lastHitTime = 0;

export const HIT_WINDOW_PERFECT = 0.08;
export const HIT_WINDOW_GOOD = 0.18;
export const MISS_EXTRA = 0.20;
export const HIT_FADE_TIME = 0.4;
export const MISS_FADE_TIME = 0.6;
export const MISS_FALL_SPEED = 220;
export const MISS_SHAKE_AMT = 10;
export const MISS_SHAKE_FREQ = 14;

export function lerp(a, b, t) { return a + (b - a) * t; }

export function addParticles(x, y, color) {
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

export function createNote(lane, time) {
  const mX = width * 0.15, mY = height * 0.15;
  const tx = mX + Math.random() * (width - mX * 2);
  const ty = mY + Math.random() * (height - mY * 2);
  const cx = width / 2, cy = height / 2;

  const dx = tx - cx, dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;

  const spawnDist = Math.max(width, height) * 0.45;

  notes.push({
    lane, time,
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

export function generateNotes(t) {
  if (!autoChartReady) return;
  while (nextBeatIndex < beatTimes.length && beatTimes[nextBeatIndex] < t + 8) {
    if (notes.filter(n => !n.judged).length >= 4) break;
    createNote(Math.floor(Math.random() * LANES.length), beatTimes[nextBeatIndex]);
    nextBeatIndex++;
  }
}

export function registerHit(n, label, baseScore) {
  n.judged = true;
  n.effect = "hit";
  n.effectTime = getSongTime();
  combo++;
  score += Math.floor(baseScore * (1 + combo * 0.05));
  lastHitText = label;
  lastHitTime = getSongTime();
  addParticles(n.targetX, n.targetY, LANES[n.lane].color);
}

export function registerMiss(n) {
  n.judged = true;
  n.effect = "miss";
  n.effectTime = getSongTime();
  combo = 0;
  lastHitText = "MISS";
  lastHitTime = getSongTime();
}
