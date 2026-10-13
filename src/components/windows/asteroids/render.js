// Drawing an Asteroids picture on a 2D canvas (spec 11). Vector art in the
// board's own colors: the theme accent is your ship and its glow, ink is
// everything else, so the game fits every look without a palette of its own.

import { ROCK_SIZES, WORLD, nextRandom } from '../../../lib/games/asteroids/engine.js';
import { SHIP_ALIVE, SHIP_SHIELD, SHIP_THRUST } from '../../../lib/games/asteroids/wire.js';

const COLOR_TOKENS = { accent: '--accent', ink: '--ink', inkSoft: '--ink-soft', inkFaint: '--ink-faint', field: '--surface-sunken' };

/**
 * Read the theme colors the game draws with. Tokens are built from calc()
 * and var() pieces a 2D canvas can't parse, so each one is resolved through
 * a hidden probe element into a plain computed color first.
 */
export function readGameColors(el) {
  const host = el?.parentElement || document.body;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
  host.appendChild(probe);
  const out = {};
  for (const [key, token] of Object.entries(COLOR_TOKENS)) {
    probe.style.color = `var(${token})`;
    out[key] = getComputedStyle(probe).color;
  }
  out.font = getComputedStyle(host).getPropertyValue('--font-sans').trim() || 'sans-serif';
  probe.remove();
  return out;
}

// A rock's outline comes from its id, so every screen draws the same rock.
const shapes = new Map();
function rockShape(id) {
  let shape = shapes.get(id);
  if (shape) return shape;
  let seed = (id * 2654435761) >>> 0;
  shape = [];
  const points = 11;
  for (let i = 0; i < points; i += 1) {
    const [v, next] = nextRandom(seed);
    seed = next;
    shape.push([(i / points) * Math.PI * 2, 0.72 + v * 0.34]);
  }
  if (shapes.size > 4000) shapes.clear();
  shapes.set(id, shape);
  return shape;
}

const STARS = (() => {
  const out = [];
  let seed = 7;
  for (let i = 0; i < 70; i += 1) {
    const [x, s1] = nextRandom(seed);
    const [y, s2] = nextRandom(s1);
    const [z, s3] = nextRandom(s2);
    seed = s3;
    out.push([x * WORLD.w, y * WORLD.h, z]);
  }
  return out;
})();

/** Where the world sits inside a canvas of width x height (letterboxed). */
export function fieldLayout(width, height) {
  const scale = Math.max(0.01, Math.min(width / WORLD.w, height / WORLD.h));
  return { scale, x: (width - WORLD.w * scale) / 2, y: (height - WORLD.h * scale) / 2 };
}

// Draw something near an edge a second time on the far side, so it slides
// across the wrap instead of popping.
function wrapped(x, y, r, draw) {
  draw(x, y);
  const xs = x < r ? [WORLD.w] : x > WORLD.w - r ? [-WORLD.w] : [];
  const ys = y < r ? [WORLD.h] : y > WORLD.h - r ? [-WORLD.h] : [];
  for (const dx of xs) draw(x + dx, y);
  for (const dy of ys) draw(x, y + dy);
  for (const dx of xs) for (const dy of ys) draw(x + dx, y + dy);
}

function drawShip(ctx, ship, color, time, unit) {
  wrapped(ship.x, ship.y, 16, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ship.a);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6 * unit;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, 8.5);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, -8.5);
    ctx.closePath();
    ctx.stroke();
    if (ship.flags & SHIP_THRUST && Math.floor(time * 30) % 2 === 0) {
      ctx.beginPath();
      ctx.moveTo(-7, 4);
      ctx.lineTo(-17, 0);
      ctx.lineTo(-7, -4);
      ctx.stroke();
    }
    ctx.restore();
    if (ship.flags & SHIP_SHIELD && Math.floor(time * 8) % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = unit;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}

/** Sparks from a broken rock or a lost ship; drawn and aged by drawPicture. */
export function sparks(x, y, count, color, seed = Date.now()) {
  const out = [];
  let s = seed >>> 0;
  for (let i = 0; i < count; i += 1) {
    const [a, s1] = nextRandom(s);
    const [v, s2] = nextRandom(s1);
    s = s2;
    const speed = 40 + v * 160;
    out.push({ x, y, vx: Math.cos(a * Math.PI * 2) * speed, vy: Math.sin(a * Math.PI * 2) * speed, life: 0.5 + v * 0.6, color });
  }
  return out;
}

/**
 * Draw one picture. `particles` is mutated (aged by dt and pruned).
 * Canvas size is in device pixels; `dpr` turns line widths back to CSS px.
 */
export function drawPicture(ctx, picture, { width, height, dpr = 1, colors, selfId, particles = [], dt = 0, time = 0 }) {
  const layout = fieldLayout(width, height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(layout.x, layout.y);
  ctx.scale(layout.scale, layout.scale);
  const unit = dpr / layout.scale; // one CSS pixel in world units

  ctx.fillStyle = colors.field;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.beginPath();
  ctx.rect(0, 0, WORLD.w, WORLD.h);
  ctx.clip();

  ctx.fillStyle = colors.inkFaint;
  for (const [x, y, z] of STARS) {
    ctx.globalAlpha = 0.25 + z * 0.35;
    ctx.fillRect(x, y, (0.8 + z) * unit, (0.8 + z) * unit);
  }
  ctx.globalAlpha = 1;
  if (!picture) { ctx.restore(); return layout; }

  ctx.strokeStyle = colors.inkSoft;
  ctx.lineWidth = 1.4 * unit;
  ctx.lineJoin = 'round';
  for (const rock of picture.rocks) {
    const r = ROCK_SIZES[rock.size].r;
    const shape = rockShape(rock.id);
    wrapped(rock.x, rock.y, r, (x, y) => {
      ctx.beginPath();
      shape.forEach(([angle, k], i) => {
        const px = x + Math.cos(angle + rock.rot) * r * k;
        const py = y + Math.sin(angle + rock.rot) * r * k;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
    });
  }

  const self = picture.ships.find((s) => s.id === selfId);
  ctx.shadowBlur = 10 * dpr;
  for (const shot of picture.shots) {
    const mine = self && shot.slot === self.slot;
    ctx.fillStyle = mine ? colors.accent : colors.ink;
    ctx.shadowColor = mine ? colors.accent : 'transparent';
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 2.2 * Math.max(1, unit), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const ship of picture.ships) {
    if (!(ship.flags & SHIP_ALIVE)) continue;
    const mine = ship.id === selfId;
    ctx.shadowColor = mine ? colors.accent : 'transparent';
    drawShip(ctx, ship, mine ? colors.accent : colors.ink, time, unit);
    if (!mine) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = colors.inkFaint;
      ctx.font = `${11 * unit}px ${colors.font}`;
      ctx.textAlign = 'center';
      ctx.fillText(ship.name, ship.x, ship.y + 28);
      ctx.shadowBlur = 10 * dpr;
    }
  }
  ctx.shadowBlur = 0;

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = Math.min(1, p.life * 1.6);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 2 * unit, 2 * unit);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  return layout;
}
