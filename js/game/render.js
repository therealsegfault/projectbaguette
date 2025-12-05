// js/game/render.js
import { ctx, width, height, BASE_R_SCALE, DEBUG } from "./core.js";
import {
  LANES,
  notes,
  particles,
  score,
  combo,
  lastHitText,
  lastHitTime,
  BEAT,
  HIT_FADE_TIME,
  MISS_FADE_TIME,
  MISS_SHAKE_FREQ,
  MISS_SHAKE_AMT,
  MISS_FALL_SPEED
} from "./notes.js";

let beatPulse = 1;

export function draw(t, fps) {
  ctx.clearRect(0,0,width,height);

  // global background dark pulse
  const bp = (t % BEAT) / BEAT;
  beatPulse = 0.5 + 0.5 * Math.sin(bp * Math.PI * 2);

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0,0,width,height);

  const r = Math.min(width, height) * BASE_R_SCALE;

  ////////////////////////////////////////////////////
  // TARGET GHOST RINGS
  ////////////////////////////////////////////////////
  for (const n of notes) {
    ctx.save();
    ctx.globalAlpha = 0.18 + beatPulse * 0.22;
    ctx.strokeStyle = LANES[n.lane].color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(n.targetX, n.targetY, r * 0.9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.05 + 0.10 * beatPulse;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(n.targetX, n.targetY, r * (0.7 + 0.3 * beatPulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ////////////////////////////////////////////////////
  // NOTES
  ////////////////////////////////////////////////////
  for (const n of notes) {
    const dt = n.progTime ?? (n.time - t);
    const prog = n.prog ?? (1 - dt / n.approach ?? 1);

    if (!n.judged) {
      if (prog < 0 || prog > 1.5) continue;

      const x = n.spawnX + (n.targetX - n.spawnX) * prog;
      const y = n.spawnY + (n.targetY - n.spawnY) * prog;

      // trailing streak
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.15 * beatPulse;
      ctx.strokeStyle = LANES[n.lane].color;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      const back = 130;
      ctx.lineTo(
        x - (n.targetX - n.spawnX) / (Math.hypot(n.targetX - n.spawnX, n.targetY - n.spawnY)) * back,
        y - (n.targetY - n.spawnY) / (Math.hypot(n.targetX - n.spawnX, n.targetY - n.spawnY)) * back
      );
      ctx.stroke();
      ctx.restore();

      // note circle
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.strokeStyle = LANES[n.lane].color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = LANES[n.lane].color;
      ctx.font = `${r * 1.2}px Arial Black`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(LANES[n.lane].label, x, y + r * 0.05);
      ctx.restore();
    }

    ////////////////////////////////////////////////////
    // HIT FX
    ////////////////////////////////////////////////////
    else {
      const age = t - n.effectTime;
      if (n.effect === "hit" && age <= HIT_FADE_TIME) {
        ctx.save();
        const p = age / HIT_FADE_TIME;
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = LANES[n.lane].color;
        ctx.beginPath();
        ctx.arc(n.targetX, n.targetY, r * (1 + p * 2.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ////////////////////////////////////////////////////
      // MISS FX
      ////////////////////////////////////////////////////
      else if (n.effect === "miss" && age <= MISS_FADE_TIME) {
        const shake = Math.sin(age * MISS_SHAKE_FREQ * Math.PI * 2 + n.shakeSeed) * MISS_SHAKE_AMT;

        ctx.globalAlpha = 1 - age / MISS_FADE_TIME;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.strokeStyle = LANES[n.lane].color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(n.targetX + shake, n.targetY + age * MISS_FALL_SPEED, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.globalAlpha = 1;
      }
    }
  }

  ////////////////////////////////////////////////////
  // PARTICLES
  ////////////////////////////////////////////////////
  for (let p of particles) {
    p.life -= 1/60;
    p.x += p.vx / 60;
    p.y += p.vy / 60;

    ctx.globalAlpha = Math.max(0, p.life / 0.4) * (0.5 + 0.5 * beatPulse);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  }

  ctx.globalAlpha = 1;

  ////////////////////////////////////////////////////
  // HUD
  ////////////////////////////////////////////////////
  ctx.fillStyle = "#fff";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Project Baguette", 20, 30);
  ctx.fillText("Score: " + score, 20, 55);
  ctx.fillText("Combo: " + combo, 20, 80);

  if (t - lastHitTime < 0.5 && lastHitText) {
    ctx.font = "32px Arial Black";
    ctx.textAlign = "center";
    ctx.fillText(lastHitText, width/2, height * 0.2);
  }

  ////////////////////////////////////////////////////
  // DEBUG HUD
  ////////////////////////////////////////////////////
  if (DEBUG) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(width - 200, 10, 180, 100);

    ctx.fillStyle = "#0f0";
    ctx.font = "14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`FPS: ${fps.toFixed(1)}`, width - 190, 30);
    ctx.fillText(`Time: ${t.toFixed(3)}s`, width - 190, 50);
  }
}
