// js/game/notes.js


export const beatTimes = [];  // Filled in audio.js
export const notes = [];

export function createNote(lane, time, width, height) {
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
