// The one message a drawn-track race sends: where my car is. Every driver's
// browser owns its own car and tells the board about it a few times a second
// over the collaboration socket; everyone else draws it. Nothing here lasts:
// the track and the best-lap table ride the shared window record instead.
//
//   game.car  driver -> everyone else   { windowId, x, y, a, lap, best, gone }

export const CAR_MESSAGE = 'game.car';
export const SEND_EVERY_MS = 50;
const LIMIT = 100000;

const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/** Validate a car message; returns the clean fields or null. Used by the server relay too. */
export function normalizeCar(message) {
  if (message?.type !== CAR_MESSAGE) return null;
  const windowId = typeof message.windowId === 'string' ? message.windowId.slice(0, 80) : '';
  if (!windowId) return null;
  if (message.gone === true) return { windowId, gone: true };
  const x = num(message.x, -LIMIT, LIMIT);
  const y = num(message.y, -LIMIT, LIMIT);
  const a = num(message.a, -LIMIT, LIMIT);
  if (x === null || y === null || a === null) return null;
  const out = { windowId, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, a: Math.round(a * 1000) / 1000 };
  const lap = num(message.lap, 0, 10000);
  if (lap !== null) out.lap = Math.floor(lap);
  const best = num(message.best, 0, 36000);
  if (best !== null) out.best = Math.round(best * 1000) / 1000;
  if (typeof message.name === 'string') out.name = message.name.slice(0, 40);
  return out;
}

/** Everyone else's cars, smoothed between messages. Pure: the caller passes the clock. */
export function createRivals({ staleMs = 3000 } = {}) {
  const cars = new Map();
  return {
    receive(message, now) {
      const clean = normalizeCar(message);
      const id = String(message?.clientId || '');
      if (!clean || !id) return false;
      if (clean.gone) return cars.delete(id);
      const prev = cars.get(id);
      cars.set(id, {
        id, name: clean.name || message?.actor?.label || 'Driver', lap: clean.lap || 0, best: clean.best || null,
        from: prev ? prev.shown(now) : clean, to: clean, at: now,
        shown(t) {
          const k = Math.min(1, (t - this.at) / SEND_EVERY_MS);
          let da = this.to.a - this.from.a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          return { x: this.from.x + (this.to.x - this.from.x) * k, y: this.from.y + (this.to.y - this.from.y) * k, a: this.from.a + da * k };
        },
      });
      return true;
    },
    list(now) {
      const out = [];
      for (const [id, car] of cars) {
        if (now - car.at > staleMs) { cars.delete(id); continue; }
        out.push({ id, name: car.name, lap: car.lap, best: car.best, ...car.shown(now) });
      }
      return out;
    },
    clear() { cars.clear(); },
  };
}
