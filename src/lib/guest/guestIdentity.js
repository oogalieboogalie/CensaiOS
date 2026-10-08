// Guest identity (spec 5): the name and color a guest picks when joining a
// shared board. Remembered in this browser so the next link is one click.
// Muted, distinguishable hues that read on light and dark looks; these are
// data (a person's cursor color), not UI chrome, so they live outside the
// token file like the pen palette does.
export const GUEST_COLORS = Object.freeze([
  '#4f7cac', '#5b8c6b', '#a0703c', '#8a5a9e',
  '#b05a5a', '#3f8f8f', '#7a7f3a', '#5e6aa8',
]);

const STORAGE_KEY = 'homebase.guestIdentity.v1';

export function loadGuestIdentity() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (value && typeof value.name === 'string') {
      return { name: value.name.slice(0, 40), color: GUEST_COLORS.includes(value.color) ? value.color : GUEST_COLORS[0] };
    }
  } catch { /* storage unavailable */ }
  return { name: '', color: GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)] };
}

export function saveGuestIdentity({ name, color }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, color })); } catch { /* storage unavailable */ }
}

/**
 * Fit a host's camera into this viewport: same board center, zoom scaled so
 * the guest sees at least what the host sees.
 */
export function followCamera(host, viewport) {
  const zoom = Number(host?.zoom) || 1;
  const hostW = Number(host?.width) || viewport.width;
  const hostH = Number(host?.height) || viewport.height;
  const centerX = (hostW / 2 - host.x) / zoom;
  const centerY = (hostH / 2 - host.y) / zoom;
  const nextZoom = zoom * Math.min(viewport.width / hostW, viewport.height / hostH);
  return {
    zoom: nextZoom,
    pan: { x: viewport.width / 2 - centerX * nextZoom, y: viewport.height / 2 - centerY * nextZoom },
  };
}
