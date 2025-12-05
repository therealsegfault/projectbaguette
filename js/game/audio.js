/* ---------- audio.js ---------- */
import { audio } from "./core.js";

export let audioCtx = null;
export let analyser = null;
export let beatTimes = [];
export let autoChartReady = false;
export let nextBeatIndex = 0;

export function getSongTime() {
  return (!audio || isNaN(audio.currentTime)) ? 0 : audio.currentTime;
}

export async function prepareAutoChart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();

  const src = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  analyser.connect(audioCtx.destination);

  try {
    const resp = await fetch(audio.src);
    const buf = await resp.arrayBuffer();
    const dec = await audioCtx.decodeAudioData(buf);

    const ch = dec.getChannelData(0);
    const sr = dec.sampleRate;
    const frame = 1024, hop = 512;

    const energies = [];
    for (let i = 0; i + frame < ch.length; i += hop) {
      let sum = 0;
      for (let j = 0; j < frame; j++) sum += ch[i + j] ** 2;
      energies.push(Math.sqrt(sum / frame));
    }

    let mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    let threshold = mean * 1.25;
    let lastBeat = -999;
    const minGap = 0.23;

    for (let i = 1; i < energies.length - 1; i++) {
      const e = energies[i];
      if (e > threshold && e > energies[i - 1] && e > energies[i + 1]) {
        const t = (i * hop) / sr;
        if (t - lastBeat >= minGap) {
          beatTimes.push(t);
          lastBeat = t;
        }
      }
    }

    if (beatTimes.length < 4) {
      for (let t = 0; t < dec.duration; t += 0.5) beatTimes.push(t);
    }

    autoChartReady = true;
  } catch {
    for (let t = 0; t < 120; t += 0.5) beatTimes.push(t);
    autoChartReady = true;
  }
}
