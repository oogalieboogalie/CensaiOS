/**
 * src/lib/desktopServer.js
 *
 * The installed censaiOS desktop app (laptop release) can open censaiOS on
 * this computer or on another one on the home network. The choice lives
 * on the native side (src-tauri/src/server.rs); this asks it which address
 * is open and sends the window back to its connect screen to pick another.
 * In a browser, or in the PC's Censai Hub launcher, there is nothing to
 * change and getDesktopServer() resolves to null.
 */

function tauriInvoke() {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke || null;
}

/** @returns {Promise<{ url: string, mode: string } | null>} */
export async function getDesktopServer() {
  const invoke = tauriInvoke();
  if (!invoke) return null;
  try {
    const info = await invoke('server_get');
    return info?.available ? { url: info.url, mode: info.mode } : null;
  } catch {
    return null;
  }
}

export async function changeDesktopServer() {
  const invoke = tauriInvoke();
  if (!invoke) return;
  await invoke('server_change');
}
