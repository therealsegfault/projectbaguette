// js/game/judge.js
// Hit/Miss rules + score/combo state

import { getSongTime } from "./time.js";
import { LANES } from "./lanes.js";
import { addParticles } from "./particles.js";
import { setHitDisplay } from "./render.js";

export let score = 0;
export let combo = 0;
export let lastHitText = "";
export let lastHitTime = 0;

export const HIT_WINDOW_PERFECT = 0.08;
export const HIT_WINDOW_GOOD = 0.18;
export const MISS_EXTRA = 0.20;

// Called from input or auto miss
export function judge(n, t) {
  const d = Math.abs(n.time - t);

  if (d <= HIT_WINDOW_PERFECT) registerHit(n, "COOL", 300);
  else if (d <= HIT_WINDOW_GOOD) registerHit(n, "FINE", 100);
  else if (d <= 0.35) registerMiss(n);
}

export function registerHit(n, label, baseScore) {
  n.judged = true;
  n.effect = "hit";
  n.effectTime = getSongTime();

  combo++;
  score += Math.floor(baseScore * (1 + combo * 0.05));

  lastHitText = label;
  lastHitTime = getSongTime();

  // Visual feedback call (simple color)
  setHitDisplay(n.targetX, n.targetY, LANES[n.lane].color);

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
