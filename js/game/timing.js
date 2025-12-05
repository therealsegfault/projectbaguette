// /js/game/timing.js
// Timing map for BPM changes + conversions

export let bpmChanges = []; // array of { time, bpm, beatLength }

export function addBpmChange(time, bpm) {
  bpmChanges.push({
    time,
    bpm,
    beatLength: 60 / bpm
  });
  bpmChanges.sort((a, b) => a.time - b.time);
}

export function resetChartTiming() {
  bpmChanges = [];
}

// Return BPM at a given song time
export function getBpmAt(t) {
  if (bpmChanges.length === 0) return null;
  let curr = bpmChanges[0];
  for (let b of bpmChanges) {
    if (b.time <= t) curr = b;
    else break;
  }
  return curr;
}

// Convert beat index to seconds using the timing map
export function beatToSeconds(beatIndex) {
  let accumulated = 0;
  let remainingBeats = beatIndex;

  for (let i = 0; i < bpmChanges.length; i++) {
    const seg = bpmChanges[i];
    const next = bpmChanges[i + 1] || null;

    const beatsInThisSeg = next
      ? (next.time - seg.time) / seg.beatLength
      : Infinity;

    if (remainingBeats > beatsInThisSeg) {
      accumulated += beatsInThisSeg * seg.beatLength;
      remainingBeats -= beatsInThisSeg;
    } else {
      accumulated += remainingBeats * seg.beatLength;
      break;
    }
  }

  return accumulated;
}
