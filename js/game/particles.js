// js/game/particles.js
// Tiny colored hit sparks

export let particles = [];

export function addParticles(x, y, color) {
  for (let i = 0; i < 14; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 240,
      vy: (Math.random() - 0.5) * 240,
      life: 0.4,
      color
    });
  }
}

// Called each frame in loop.js
export function cleanupParticles() {
  particles = particles.filter(p => p.life > 0);
}
