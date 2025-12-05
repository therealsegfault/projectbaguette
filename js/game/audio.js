import { audio, mv, BASE } from "../base.js";
import { setBPM, beatTimes, setAutoChartReady } from "./timing.js";

export async function prepareAutoChart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AC();

  // Load song via fetch (base aware)
  const resp = await fetch(`${BASE}/assets/defaults/song-demo.mp3`);
  const buf = await resp.arrayBuffer();
  const dec = await audioCtx.decodeAudioData(buf);

  // Estimate BPM
  const data = dec.getChannelData(0);
  const sr = dec.sampleRate;

  const frame = 1024;
  const hop = 512;
  const energies = [];

  for (let i = 0; i + frame < data.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < frame; j++) sum += data[i + j] ** 2;
    energies.push(Math.sqrt(sum / frame));
  }

  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
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

  if (beatTimes.length >= 2) {
    const avgDiff = (beatTimes[beatTimes.length - 1] - beatTimes[0]) / beatTimes.length;
    setBPM(Math.round(60 / avgDiff));
  }

  setAutoChartReady(true);
}
