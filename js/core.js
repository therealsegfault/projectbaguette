/* ---------- core.js ---------- */

export const DEBUG = new URLSearchParams(location.search).get("debug") === "1";

// Elements
export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d");
export const mv = document.getElementById("mv");
export const audio = document.getElementById("song");

// MV hidden until audio starts (iOS-safe)
mv.style.opacity = "0";
mv.style.display = "none";
mv.style.transition = "opacity 1s ease";

// Canvas sizing
export let width = window.innerWidth;
export let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

window.addEventListener("resize", () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
});

// Mobile layout tweak
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
export const BASE_R_SCALE = isMobile ? 0.10 : 0.045;

// Tap-to-start overlay
export const startOverlay = document.createElement("div");
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

// Pulse blink
let blink = true;
setInterval(() => {
  blink = !blink;
  const el = document.getElementById("tapText");
  if (el) el.style.opacity = blink ? "0.9" : "0.4";
}, 600);
