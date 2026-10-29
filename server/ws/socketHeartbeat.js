// A browser that vanishes without closing its socket (a laptop lid shut, the
// Wi-Fi gone) would stay on the board's people list until the operating
// system gives up on the connection, which can take a quarter of an hour.
// Every HEARTBEAT_MS each socket is pinged (browsers answer on their own);
// one that did not answer the previous ping is cut, so it leaves the list
// like a closed tab.
export const HEARTBEAT_MS = 15_000;

/** Pings every socket of `wss` and cuts the silent ones; returns `wss`. */
export function keepAlive(wss, intervalMs = HEARTBEAT_MS) {
  const answered = new WeakSet();
  wss.on('connection', (ws) => {
    answered.add(ws);
    ws.on('pong', () => answered.add(ws));
  });
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!answered.has(ws)) {
        ws.terminate();
        continue;
      }
      answered.delete(ws);
      ws.ping();
    }
  }, intervalMs);
  timer.unref?.();
  wss.on('close', () => clearInterval(timer));
  return wss;
}
