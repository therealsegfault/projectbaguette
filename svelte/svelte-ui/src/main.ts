// src/main.ts
import App from './routes/+page.svelte';

new App({
  target: document.getElementById('svelte')!
});

// Expose a global function so your +page.svelte can start the game
declare global {
  interface Window {
    startRhythmGame: () => void;
  }
}

window.startRhythmGame = () => {
  import('/js/main.js').then(() => {
    console.log('Rhythm engine loaded – game starting!');
    // Your existing main.js will handle tap-to-start, canvas, audio, MV, etc.
  });
};
