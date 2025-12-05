/* ---------- input.js ---------- */


const keysDown = new Set();

export function handleKey(key) {
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
  if (best) registerHit(best, "COOL", 300);
}

window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (!keysDown.has(k)) {
    keysDown.add(k);
    handleKey(k);
  }
});
window.addEventListener("keyup", e => keysDown.delete(e.key.toLowerCase()));

export function hitAt(x, y) {
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
    if (val < scoreVal) { scoreVal = val; best = n; }
  }
  if (best) registerHit(best, "COOL", 300);
}

canvas.addEventListener("mousedown", e => {
  const r = canvas.getBoundingClientRect();
  hitAt(
    (e.clientX - r.left) * (canvas.width / r.width),
    (e.clientY - r.top) * (canvas.height / r.height)
  );
});
canvas.addEventListener("touchstart", e => {
  const r = canvas.getBoundingClientRect();
  const t = e.touches[0];
  hitAt(
    (t.clientX - r.left) * (canvas.width / r.width),
    (t.clientY - r.top) * (canvas.height / r.height)
  );
  e.preventDefault();
}, { passive:false });
