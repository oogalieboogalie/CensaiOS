import { installStaleBuildReload } from '../src/lib/appUpdate/staleBuild.js';

function fakeWindow() {
  const listeners = {};
  const store = new Map();
  return {
    reloads: 0,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    fire(name) { const event = { prevented: false, preventDefault() { this.prevented = true; } }; listeners[name](event); return event; },
    location: { reload() { this.owner.reloads += 1; } },
    sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  };
}

describe('stale build reload', () => {
  test('a failed chunk load reloads once into the new build', () => {
    const win = fakeWindow();
    win.location.owner = win;
    let t = 1_000_000;
    installStaleBuildReload({ win, now: () => t });
    expect(win.fire('vite:preloadError').prevented).toBe(true);
    expect(win.reloads).toBe(1);
    // Still failing right after the reload: a real error, no reload loop.
    t += 5_000;
    expect(win.fire('vite:preloadError').prevented).toBe(false);
    expect(win.reloads).toBe(1);
    // Much later (another update): reload again.
    t += 120_000;
    win.fire('vite:preloadError');
    expect(win.reloads).toBe(2);
  });
});
