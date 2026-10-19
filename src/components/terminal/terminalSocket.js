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
 * onDrop(attempt, delayMs), onExit(), onRefused(message): the server said
 * why it won't open this terminal (`{ type: 'refused', reason, message }`),
 * so retrying would only fail again.
 * Returns { send(obj), isOpen(), reconnectNow(), close() }.
 */
export function openTerminalSocket(url, handlers, { WebSocketImpl = WebSocket, win = typeof window === 'undefined' ? null : window } = {}) {
  let socket = null;
  let attempt = 0;
  let everOpened = false;
  let closed = false;
  let exited = false;
  let refusal = null;
  let timer = null;

  const connect = () => {
    clearTimeout(timer);
    timer = null;
    if (closed) return;
    const isReconnect = everOpened || attempt > 0;
    refusal = null;
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
      let message = null;
      try { message = JSON.parse(event.data); } catch { /* plain text output */ }
      if (message?.type === 'exit') exited = true;
      if (message?.type === 'refused') { refusal = message; return; }
      handlers.onMessage?.(event, isReconnect);
    });
    s.addEventListener('close', () => {
      if (s !== socket || closed) return;
      // The program itself ended: stay put until the person presses Enter.
      if (exited) { handlers.onExit?.(); return; }
      if (refusal) { exited = true; handlers.onRefused?.(refusal); return; }
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
  return (await terminalRefusal(fetchImpl)) !== 'signed-out';
}

// Why the server would refuse this terminal, as far as the browser can tell:
// 'signed-out', 'owner-only' (the terminal runs on the computer, so only its
// owner may open one), or null (nothing known: keep retrying).
export async function terminalRefusal(fetchImpl = typeof fetch === 'undefined' ? null : fetch) {
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl('/api/auth/session', { credentials: 'include' });
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.authenticated === false) return 'signed-out';
    if (body?.user?.role && body.user.role !== 'admin') return 'owner-only';
    return null;
  } catch {
    return null; // server still down: keep quietly retrying
  }
}
