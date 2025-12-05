// js/game/timing.js
// Stores shared BPM/BEAT + clock

let BPM = 120;
let BEAT = 60 / 120;

export function setBPM(bpm) {
  if (!bpm || bpm < 40 || bpm > 300) return; // sanity guard
  BPM = bpm;
  BEAT = 60 / bpm;
  console.log(`🎼 BPM Set → ${bpm}`);
}

export function getBPM() { return BPM; }
export function getBEAT() { return BEAT; }

// Shared time source
export function getSongTime() {
  const audio = document.getElementById("song");
  return audio && !isNaN(audio.currentTime) ? audio.currentTime : 0;
}
