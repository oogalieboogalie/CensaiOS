// The terminal's line to its shell on the server, with automatic reconnect.
// A drop (server restart, sleep, Wi-Fi blip, the desktop app rebuilding) used
// to leave "Terminal disconnected. Press Enter" until someone pressed Enter;
// now it says "Reconnecting…" and keeps trying on its own. The shell on the
// server lives on through short drops, so a reconnect picks up the same
// shell and redraws its screen.

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

export function reconnectDelay(attempt) {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

/**
 * handlers: onOpen(isReconnect), onMessage(event, isReconnect),
 * onDrop(attempt, delayMs), onExit().
 * Returns { send(obj), isOpen(), reconnectNow(), close() }.
 */
export function openTerminalSocket(url, handlers, { WebSocketImpl = WebSocket, win = typeof window === 'undefined' ? null : window } = {}) {
  let socket = null;
  let attempt = 0;
  let everOpened = false;
  let closed = false;
  let exited = false;
  let timer = null;

  const connect = () => {
    clearTimeout(timer);
    timer = null;
    if (closed) return;
    const isReconnect = everOpened || attempt > 0;
    const s = new WebSocketImpl(url);
    socket = s;
    s.addEventListener('open', () => {
      if (s !== socket) return;
      attempt = 0;
      everOpened = true;
      handlers.onOpen?.(isReconnect);
    });
    s.addEventListener('message', (event) => {
      if (s !== socket) return;
      try {
        if (JSON.parse(event.data)?.type === 'exit') exited = true;
      } catch { /* plain text output */ }
      handlers.onMessage?.(event, isReconnect);
    });
    s.addEventListener('close', () => {
      if (s !== socket || closed) return;
      // The program itself ended: stay put until the person presses Enter.
      if (exited) { handlers.onExit?.(); return; }
      const delay = reconnectDelay(attempt);
      handlers.onDrop?.(attempt, delay);
      attempt += 1;
      timer = setTimeout(connect, delay);
    });
  };

  // Coming back to the window or back online: try right away.
  const nudge = () => {
    if (closed || exited || !timer) return;
    if (win?.document?.visibilityState === 'hidden') return;
    connect();
  };
  win?.addEventListener?.('online', nudge);
  win?.document?.addEventListener?.('visibilitychange', nudge);

  connect();

  return {
    send(message) {
      if (socket && socket.readyState === 1) socket.send(JSON.stringify(message));
    },
    isOpen: () => Boolean(socket && socket.readyState === 1),
    isWaiting: () => Boolean(timer),
    hasExited: () => exited,
    reconnectNow() {
      if (closed) return;
      exited = false;
      connect();
    },
    close() {
      closed = true;
      clearTimeout(timer);
      win?.removeEventListener?.('online', nudge);
      win?.document?.removeEventListener?.('visibilitychange', nudge);
      try { socket?.close(); } catch { /* already closed */ }
    },
  };
}

// A browser can't read why a WebSocket was refused. When retries keep
// failing, ask the server whether this browser is still signed in, so the
// terminal can say "signed out" instead of retrying in silence.
export async function stillSignedIn(fetchImpl = typeof fetch === 'undefined' ? null : fetch) {
  if (!fetchImpl) return true;
  try {
    const res = await fetchImpl('/api/auth/session', { credentials: 'include' });
    if (!res.ok) return true;
    const body = await res.json();
    return body?.authenticated !== false;
  } catch {
    return true; // server still down: keep quietly retrying
  }
}
