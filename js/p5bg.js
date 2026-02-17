// Project Beats — Menu Background (osu!-inspired)
// Rotating geometric triangles + radial bloom in pink/magenta palette.
// Beat-reactive via PB_MENU_STATE.beatPulse (written by engine.js analyser).
// Falls back to BPM sine wave when no audio is active.

(() => {
  if (typeof p5 === 'undefined') return;

  let _p = null;

  new p5(p => {
    _p = p;

    // Triangle ring parameters
    const RINGS = [
      { count: 6,  radius: 0.28, size: 0.09, speed: 0.008,  phase: 0 },
      { count: 9,  radius: 0.44, size: 0.065, speed: -0.005, phase: 1.1 },
      { count: 12, radius: 0.60, size: 0.045, speed: 0.003,  phase: 0.5 },
      { count: 5,  radius: 0.16, size: 0.12,  speed: -0.012, phase: 2.0 },
    ];

    let rot = 0; // global rotation accumulator

    p.setup = () => {
      const holder = document.getElementById('bg-canvas-holder');
      const cnv    = p.createCanvas(holder.clientWidth, holder.clientHeight);
      cnv.parent(holder);
      p.frameRate(30);
    };

    p.windowResized = () => {
      const holder = document.getElementById('bg-canvas-holder');
      p.resizeCanvas(holder.clientWidth, holder.clientHeight);
    };

    p.draw = () => {
      const menu = document.getElementById('menu-root');
      if (menu && menu.style.display === 'none') { p.noLoop(); return; }

      const state = window.PB_MENU_STATE || {};
      const bpm   = state.bpm || 120;

      // Beat pulse: live from engine analyser or synthesised BPM sine
      const livePulse = state.beatPulse ?? 0;
      const synthPulse = (p.sin((p.millis() / 1000) * (bpm / 60) * p.TWO_PI) + 1) * 0.5;
      const pulse = livePulse > 0.02 ? livePulse : synthPulse * 0.4;

      rot += 0.004 + pulse * 0.012;

      const w = p.width, h = p.height;
      const cx = w * 0.5, cy = h * 0.52;
      const minDim = Math.min(w, h);

      // ── Dark background with vignette ──────────────────────────────
      p.background(18, 5, 14);

      // Radial vignette (darker edges)
      const vgrad = p.drawingContext.createRadialGradient(cx, cy, 0, cx, cy, minDim * 0.72);
      vgrad.addColorStop(0,   'rgba(40,8,28,0)');
      vgrad.addColorStop(1,   'rgba(5,0,8,0.75)');
      p.drawingContext.fillStyle = vgrad;
      p.drawingContext.fillRect(0, 0, w, h);

      // ── Central radial bloom ───────────────────────────────────────
      const bloomR = minDim * (0.22 + pulse * 0.12);
      const bloom  = p.drawingContext.createRadialGradient(cx, cy, 0, cx, cy, bloomR);
      bloom.addColorStop(0,   `rgba(255,51,133,${0.18 + pulse * 0.22})`);
      bloom.addColorStop(0.4, `rgba(180,30,90,${0.08 + pulse * 0.08})`);
      bloom.addColorStop(1,   'rgba(0,0,0,0)');
      p.drawingContext.fillStyle = bloom;
      p.drawingContext.beginPath();
      p.drawingContext.arc(cx, cy, bloomR, 0, Math.PI * 2);
      p.drawingContext.fill();

      // ── Triangle rings ─────────────────────────────────────────────
      p.push();
      p.translate(cx, cy);
      p.rotate(rot);

      RINGS.forEach((ring, ri) => {
        const r    = minDim * ring.radius;
        const s    = minDim * ring.size * (1 + pulse * 0.3);
        const step = (Math.PI * 2) / ring.count;

        for (let i = 0; i < ring.count; i++) {
          const a   = step * i + ring.phase + rot * ring.speed * 60;
          const tx  = Math.cos(a) * r;
          const ty  = Math.sin(a) * r;

          // Colour alternates between pink and cyan per ring
          const isEven = ri % 2 === 0;
          const alpha  = (0.12 + pulse * 0.18) * (1 - ri * 0.18);

          p.push();
          p.translate(tx, ty);
          p.rotate(a + rot * 2);
          p.noStroke();

          if (isEven) {
            p.fill(255, 51 + pulse * 60, 133 + pulse * 40, alpha * 255);
          } else {
            p.fill(102 + pulse * 40, 217 + pulse * 20, 255, alpha * 255);
          }

          // Equilateral triangle
          drawTriangle(p, 0, 0, s);

          // Inner highlight
          p.fill(255, 255, 255, alpha * 0.35 * 255);
          drawTriangle(p, 0, 0, s * 0.42);

          p.pop();
        }
      });

      p.pop();

      // ── Subtle horizontal scan band (osu!-style brightness stripe) ─
      const diffIdx = state.diffIndex || 0;
      const bandY   = h * (0.35 + diffIdx * 0.08);
      p.noStroke();
      p.fill(255, 102, 171, 14);
      p.rect(0, bandY - 1, w, h * 0.04);

      // ── Starburst lines from center (beat flash) ───────────────────
      if (pulse > 0.3) {
        const lineAlpha = (pulse - 0.3) / 0.7 * 60;
        p.stroke(255, 51, 133, lineAlpha);
        p.strokeWeight(1);
        const spokes = 12;
        for (let i = 0; i < spokes; i++) {
          const a    = (Math.PI * 2 / spokes) * i + rot;
          const len  = minDim * (0.15 + pulse * 0.20);
          p.line(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        }
        p.noStroke();
      }
    };

    // Draw an equilateral triangle centred at (x,y) with circumradius r
    function drawTriangle(p, x, y, r) {
      p.beginShape();
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 / 3) * i - Math.PI / 2;
        p.vertex(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      p.endShape(p.CLOSE);
    }
  });

  window.PB_BG_STOP  = () => { try { _p?.noLoop(); } catch (e) {} };
  window.PB_BG_START = () => { try { _p?.loop();   } catch (e) {} };
})();
