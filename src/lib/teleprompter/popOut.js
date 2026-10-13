import { tauriInvoke } from '../nativeBrowserPane.js';

// Where the pop-out page lives: the same site with ?teleprompter, which
// main.jsx renders as the reader alone (no canvas, no sign-in).
export function prompterUrl(origin = globalThis.location?.origin || '') {
  return `${origin}/?teleprompter=1`;
}

const POP_W = 760;
const POP_H = 240;

/**
 * Opens the reader in its own window, best option first:
 * 1. Desktop app: a small always-on-top window at the top middle of the
 *    screen (right under a laptop or monitor camera), hidden from screen
 *    recordings so it never shows up in the video.
 * 2. Chrome or Edge: a picture-in-picture window, which always stays on top.
 * 3. Older desktop app: a normal separate window you drag under the camera.
 * 4. Anything else: a browser pop-up window.
 * Returns which one opened, so the window can say what to expect.
 */
export async function openPrompterPopOut({ win = globalThis.window, url = prompterUrl() } = {}) {
  const invoke = tauriInvoke();
  if (invoke) {
    try {
      await invoke('teleprompter_open', { url, width: POP_W, height: POP_H });
      return 'desktop-on-top';
    } catch {
      // A desktop app built before the teleprompter: fall through.
    }
  }
  const pip = win?.documentPictureInPicture;
  if (pip?.requestWindow) {
    try {
      const popup = await pip.requestWindow({ width: POP_W, height: POP_H });
      const frame = popup.document.createElement('iframe');
      frame.src = url;
      frame.title = 'Teleprompter';
      frame.setAttribute('style', 'border:0;width:100%;height:100%;display:block');
      popup.document.body.setAttribute('style', 'margin:0;height:100vh;overflow:hidden');
      popup.document.body.append(frame);
      return 'picture-in-picture';
    } catch {
      // Blocked (no click, or turned off): try the next way.
    }
  }
  if (invoke) {
    try {
      await invoke('open_external_window', { url, title: 'Teleprompter' });
      return 'desktop-window';
    } catch {
      // Fall through to a plain pop-up.
    }
  }
  const opened = win?.open?.(url, 'censai-teleprompter', `popup,width=${POP_W},height=${POP_H},top=0,left=${Math.max(0, Math.round(((win.screen?.availWidth || POP_W) - POP_W) / 2))}`);
  return opened ? 'popup' : 'blocked';
}

export const POP_OUT_NOTES = {
  'desktop-on-top': 'Opened at the top of your screen, on top of everything. It does not show up in screen recordings.',
  'picture-in-picture': 'Opened on top of everything. Drag it right under your camera.',
  'desktop-window': 'Opened in its own window. Drag it right under your camera.',
  popup: 'Opened in its own window. Drag it right under your camera.',
  blocked: 'Your browser blocked the pop-out. Allow pop-ups for this site and try again.',
};
