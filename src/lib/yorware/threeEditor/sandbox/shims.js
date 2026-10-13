// Runs first inside the sealed 3D Editor, before any editor file. The sandbox
// has an opaque origin, so the browser refuses localStorage, and it can't
// tell the board's light or dark theme through prefers-color-scheme. These
// give the editor what it expects without touching its files.

const DARK_QUERY = /prefers-color-scheme:\s*dark/;
const listeners = new Set();
let dark = false;

// The editor keeps its settings in localStorage; here they last for the session.
try {
  void window.localStorage.length;
} catch {
  try { Object.defineProperty(window, 'localStorage', { value: {}, configurable: true }); } catch { /* settings can't be kept */ }
}

// VR and AR need the headset permission a sandboxed window never gets; the
// editor only offers them when the browser has WebXR, so hide it.
try { delete Navigator.prototype.xr; } catch { /* nothing to hide */ }

// File > Export and Save make a blob: link and click it. A sealed box may not
// download, so the file is handed to the board's page, which saves it.
function handOver(link) {
  fetch(link.href).then((res) => res.arrayBuffer()).then((data) => {
    parent.postMessage({ __hbModule: 1, id: 0, method: 'download', args: { name: link.download, data } }, '*', [data]);
  }).catch((err) => window.censai?.toast(`Could not save the file: ${err?.message || err}`));
}
const isFileLink = (link, event) => (!event || event.type === 'click') && link.download && /^(blob|data):/.test(link.href);
const nativeDispatch = HTMLAnchorElement.prototype.dispatchEvent;
HTMLAnchorElement.prototype.dispatchEvent = function dispatchEvent(event) {
  if (isFileLink(this, event)) { handOver(this); return false; }
  return nativeDispatch.call(this, event);
};
const nativeClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function click() {
  if (isFileLink(this)) { handOver(this); return; }
  nativeClick.call(this);
};

/** Dark when the board's surface color is dark (any CSS color the theme uses). */
export function isDarkColor(value) {
  if (!value) return false;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#fff';
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
}

function applyTheme() {
  const next = isDarkColor(window.censai?.theme.get('--surface'));
  document.documentElement.classList.toggle('yor-dark', next);
  if (next === dark) return;
  dark = next;
  listeners.forEach((fn) => { try { fn({ matches: dark, media: '(prefers-color-scheme: dark)' }); } catch (err) { console.error(err); } });
}

// The viewport picks its background and grid colors from this query.
const nativeMatchMedia = window.matchMedia?.bind(window);
window.matchMedia = function matchMedia(query) {
  if (!DARK_QUERY.test(String(query))) return nativeMatchMedia(query);
  return {
    get matches() { return dark; },
    media: String(query),
    addEventListener(type, fn) { if (type === 'change') listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); },
    addListener(fn) { listeners.add(fn); },
    removeListener(fn) { listeners.delete(fn); },
    onchange: null,
  };
};

applyTheme();
window.censai?.theme.onChange(applyTheme);
