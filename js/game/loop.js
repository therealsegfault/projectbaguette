// js/game/loop.js
//
// High-speed uncapped main loop
// Behavior preserved from v8-P engine
//

import { getSongTime } from "./time.js";
import { generateNotes, notes, cleanupNotes, APPROACH_TIME } from "./notes.js";
import { drawFrame } from "./render.js";
import { registerMiss, HIT_WINDOW_GOOD, MISS_EXTRA } from "./judge.js";
import { particles, cleanupParticles } from "./particles.js";

// exported so start.js can trigger
export function startLoop() {
  requestAnimationFrame(loop);
}

let lastFrame = performance.now();
let fps = 0;
let smoothedApproach = APPROACH_TIME;

function loop() {
  const now = performance.now();
  fps = 1000 / (now - lastFrame);
  lastFrame = now;

  const t = getSongTime();

  // adaptive approach: more active notes = longer travel time
  const active = notes.filter(n => !n.judged).length;
  smoothedApproach = smoothedApproach + (APPROACH_TIME + active * 0.12 - smoothedApproach) * 0.18;

  // generate upcoming notes from beat list
  generateNotes(t);

  // render current frame
  drawFrame(t, fps, smoothedApproach);

  // mark too-late notes as misses
  for (const n of notes) {
    if (!n.judged && t > n.time + HIT_WINDOW_GOOD + MISS_EXTRA) {
      registerMiss(n);
    }
  }

  // cleanup judged + faded notes & particles
  cleanupNotes(t);
  cleanupParticles();

  requestAnimationFrame(loop);
}
