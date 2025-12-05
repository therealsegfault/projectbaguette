// js/game/time.js
//not to be confused with timING.js
export function getSongTime() {
  const audio = document.getElementById("song");
  if (audio && !isNaN(audio.currentTime)) return audio.currentTime;
  return 0;
}
