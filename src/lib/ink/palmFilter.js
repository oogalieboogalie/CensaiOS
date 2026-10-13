// Palm rejection and pointer routing (spec 9): the pen draws, fingers
// navigate, and the side of a hand resting on the screen does nothing.
//
// A touch counts as a palm when
//   - its contact patch is large (fingertips are ~10-25 px, a palm 40+), or
//   - a pen is touching, or was touching or hovering within the grace window
//     (tablets report pen hover, and a palm usually lands just before or
//     after the nib does).
// Once a touch is called a palm it stays one until it lifts.

export const PALM_CONTACT_PX = 36;
export const PEN_GRACE_MS = 500;

export function createPalmFilter({ now = () => Date.now(), contactPx = PALM_CONTACT_PX, graceMs = PEN_GRACE_MS } = {}) {
  const pensDown = new Set();
  const palms = new Set();
  let penLastSeen = -Infinity;
  let penSeen = false;

  const penNearby = () => pensDown.size > 0 || now() - penLastSeen < graceMs;

  return {
    /** 'pen' | 'touch' | 'mouse' | 'palm' for a pointer event, updating state. */
    classify(event, phase = 'move') {
      const type = event?.pointerType || 'mouse';
      const id = event?.pointerId;
      if (type === 'pen') {
        penSeen = true;
        penLastSeen = now();
        if (phase === 'down') pensDown.add(id);
        if (phase === 'up') pensDown.delete(id);
        return 'pen';
      }
      if (type !== 'touch') return 'mouse';
      if (palms.has(id)) {
        if (phase === 'up') palms.delete(id);
        return 'palm';
      }
      const big = Math.max(Number(event.width) || 0, Number(event.height) || 0) >= contactPx;
      if (phase === 'down' && (big || penNearby())) {
        palms.add(id);
        return 'palm';
      }
      return 'touch';
    },
    /** True once this device has used a pen, so single touches only navigate. */
    get penSeen() { return penSeen; },
    get penDown() { return pensDown.size > 0; },
    reset() { pensDown.clear(); palms.clear(); penLastSeen = -Infinity; },
  };
}
