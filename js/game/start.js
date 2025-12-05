// js/game/start.js
//
// Handles: Splash screen → unlock audio → auto-chart → start MV + loop
//

import { audio, mv, audioCtx, prepareAutoChart } from "./audio.js";
import { startLoop } from "./loop.js";

// Create tap overlay exactly once
const overlay = document.createElement("div");
overlay.style.cssText = `
  position:fixed; inset:0;
  background:black; color:white;
  display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  font-family:Arial Black, sans-serif;
  z-index:99999; font-size:32px;
`;
overlay.innerHTML = `
  <div style="opacity:0.9">PROJECT BAGUETTE</div>
  <div id="tapToStart" style="margin-top:20px;font-size:20px;opacity:0.7;">Tap to Start</div>
`;
document.body.appendChild(overlay);

// blinking text
setInterval(() => {
  const el = document.getElementById("tapToStart");
  if (el) el.style.opacity = (el.style.opacity === "0.4" ? "0.9" : "0.4");
}, 600);

// --------------------- CLICK / TAP ---------------------
overlay.addEventListener("click", async () => {
  overlay.style.transition = "opacity 0.4s ease";
  overlay.style.opacity = "0";

  setTimeout(() => overlay.remove(), 450);

  // unlock audio
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
    else if (!audioCtx) new AC();
  } catch (_) {}

  // auto-chart BEFORE audio playback
  try {
    await prepareAutoChart();
  } catch (err) {
    console.warn("Auto chart error:", err);
  }

  // start audio
  try { await audio.play(); }
  catch { alert("Tap again — Safari blocked audio."); return; }

  // MV start
  mv.style.display = "block";
  mv.style.opacity = "0";
  requestAnimationFrame(() => (mv.style.opacity = "1"));
  mv.play().catch(err => console.warn("MV blocked:", err));

  // Begin game loop
  startLoop();
});
