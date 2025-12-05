// js/game/loop.js
import { draw } from "./render.js";
import { getSongTime } from "./audio.js";
import { notes, smoothedApproach, APPROACH_TIME, generateNotes, HIT_WINDOW_GOOD, MISS_EXTRA, registerMiss } from "./notes.js";
import { setSmoothedApproach } from "./notes.js";

let fps = 0;
let lastFrame = performance.now();

function step() {
  const now = performance.now();
  fps = 1000 / (now - lastFrame);
  lastFrame = now;

  const t = getSongTime();

  // Difficulty scaling by note density
  const active = notes.filter(n => !n.judged).length;
  setSmoothedApproach(smoothedApproach + (APPROACH_TIME + active * 0.12 - smoothedApproach) * 0.18);

  generateNotes(t);
  draw(t, fps);

  // Auto-miss
  for (const n of notes) {
    if (!n.judged && t > n.time + HIT_WINDOW_GOOD + MISS_EXTRA) {
      registerMiss(n);
    }
  }

  // Remove dead effects
  const toKeep = [];
  for (const n of notes) {
    if (!n.judged) toKeep.push(n);
    else {
      const age = t - n.effectTime;
      if ((n.effect === "hit" && age <= 0.4) || (n.effect === "miss" && age <= 0.6)) {
        toKeep.push(n);
      }
    }
  }
  notes.length = 0;
  notes.push(...toKeep);

  requestAnimationFrame(step);
}

// Export start function
export function startLoop() {
  requestAnimationFrame(step);
}
