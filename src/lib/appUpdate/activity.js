/** Tell the server someone typed or clicked, at most once per gap. */

export const ACTIVITY_GAP_MS = 30 * 1000;

export function bindAppActivity(target, send, { gapMs = ACTIVITY_GAP_MS, now = Date.now } = {}) {
  let last = null;
  const onEvent = () => {
    const at = now();
    if (last !== null && at - last < gapMs) return;
    last = at;
    Promise.resolve(send()).catch(() => {});
  };
  target.addEventListener('keydown', onEvent);
  target.addEventListener('pointerdown', onEvent);
  return () => {
    target.removeEventListener('keydown', onEvent);
    target.removeEventListener('pointerdown', onEvent);
  };
}
