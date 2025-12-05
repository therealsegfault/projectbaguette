import { unlockAudioContext, prepareAutoChart } from "./audio.js";
import { startLoop } from "./loop.js";

const overlay = document.getElementById("startOverlay");
const tapText = document.getElementById("tapText");
const audio = document.getElementById("song");
const mv = document.getElementById("mv");

// Blink stays animated via CSS or we can animate here
let blink = true;
setInterval(() => {
  blink = !blink;
  if (tapText) tapText.style.opacity = blink ? "0.9" : "0.4";
}, 600);

overlay.addEventListener("click", async () => {
  // fade out overlay
  overlay.style.transition = "opacity 0.4s ease";
  overlay.style.opacity = "0";
  setTimeout(() => overlay.remove(), 450);

  // unlock audio context
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!window.audioCtx) window.audioCtx = new AC();
  if (window.audioCtx.state === "suspended") {
    await window.audioCtx.resume().catch(() => {});
  }

  // build chart BEFORE audio plays
  try {
    await prepareAutoChart();
  } catch {
    console.warn("Failed to autogen chart - fallback will trigger.");
  }

  // start audio
  try {
    await audio.play();
  } catch (err) {
    alert("Tap again — browser blocked playback.");
    return;
  }

  // MV video fade-in logic
  const showMV = () => {
    mv.style.display = "block";
    requestAnimationFrame(() => (mv.style.opacity = "1"));
    mv.play().catch(() => {});
  };

  if (mv.readyState >= 2) showMV();
  else mv.addEventListener("loadeddata", showMV, { once: true });

  // start the game
  startLoop();
});
