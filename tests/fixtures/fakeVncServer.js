// A tiny VNC server on a WebSocket, for VM window tests and screenshots.
// Speaks just enough RFB 3.8 for noVNC: None or VNC password auth, a 32-bit
// true-colour screen sent as Raw rectangles, and it records the keys,
// pointer moves and clipboard text the viewer sends.
//
//   const vm = await startFakeVncServer({ password: 'pw', width: 320, height: 200 });
//   ws://127.0.0.1:${vm.port}/   ...   vm.events, vm.sendClipboard('hi'), await vm.close()
//
// Run it by hand for a demo: node tests/fixtures/fakeVncServer.js 6080 [password]

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let desPromise = null;
async function vncResponse(password, challenge) {
  // noVNC's own DES (node's OpenSSL 3 dropped des-ecb), so the stub checks
  // the password the same way a real server would.
  desPromise ||= import(pathToFileURL(path.join(process.cwd(), 'node_modules/@novnc/novnc/core/crypto/des.js')).href);
  const { DESECBCipher } = await desPromise;
  // Same key bytes noVNC builds; its DES applies VNC's bit order itself.
  const key = password.split('').map((c) => c.charCodeAt(0));
  return Buffer.from(DESECBCipher.importKey(key).encrypt(null, challenge));
}

/** A plain test screen: a desktop colour, a title bar and a window. */
export function testPattern(width, height) {
  const rgba = new Uint8Array(width * height * 4);
  const fill = (x0, y0, w, h, [r, g, b]) => {
    for (let y = Math.max(0, y0); y < Math.min(height, y0 + h); y += 1) {
      for (let x = Math.max(0, x0); x < Math.min(width, x0 + w); x += 1) {
        const i = (y * width + x) * 4;
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
      }
    }
  };
  fill(0, 0, width, height, [36, 52, 71]);
  fill(0, 0, width, 12, [20, 20, 24]);
  fill(Math.round(width * 0.15), Math.round(height * 0.2), Math.round(width * 0.5), Math.round(height * 0.5), [235, 235, 235]);
  return rgba;
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }

export async function startFakeVncServer({
  port = 0, host = '127.0.0.1', password = null, width = 320, height = 200, rgba = null, name = 'Test VM',
} = {}) {
  const screen = rgba ? Uint8Array.from(rgba) : testPattern(width, height);
  const events = [];
  const clients = new Set();
  // By path: under jsdom, a bare 'ws' resolves to its browser stub.
  const { WebSocketServer } = await import(pathToFileURL(path.join(process.cwd(), 'node_modules/ws/wrapper.mjs')).href);
  const wss = new WebSocketServer({ port, host, handleProtocols: (protocols) => [...protocols][0] || false });

  wss.on('connection', (ws) => {
    clients.add(ws);
    let state = 'version';
    let buf = Buffer.alloc(0);
    let challenge = null;
    const send = (data) => ws.send(data);
    const frame = (x = 0, y = 0, w = width, h = height) => {
      const pixels = Buffer.alloc(w * h * 4);
      for (let row = 0; row < h; row += 1) {
        for (let col = 0; col < w; col += 1) {
          const s = ((y + row) * width + (x + col)) * 4;
          const d = (row * w + col) * 4;
          // noVNC asks for red in the low byte: R, G, B, pad.
          pixels[d] = screen[s]; pixels[d + 1] = screen[s + 1]; pixels[d + 2] = screen[s + 2];
        }
      }
      send(Buffer.concat([Buffer.from([0, 0]), u16(1), u16(x), u16(y), u16(w), u16(h), u32(0), pixels]));
    };
    const serverInit = () => {
      const nameBytes = Buffer.from(name, 'utf8');
      const pf = Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0]);
      send(Buffer.concat([u16(width), u16(height), pf, u32(nameBytes.length), nameBytes]));
    };
    ws.__frame = frame;

    send(Buffer.from('RFB 003.008\n'));
    ws.on('message', async (data) => {
      buf = Buffer.concat([buf, Buffer.from(data)]);
      for (;;) {
        if (state === 'version') {
          if (buf.length < 12) return;
          buf = buf.subarray(12);
          state = 'security';
          send(Buffer.from([1, password ? 2 : 1]));
        } else if (state === 'security') {
          if (buf.length < 1) return;
          const type = buf[0];
          buf = buf.subarray(1);
          if (password && type === 2) {
            challenge = randomBytes(16);
            send(challenge);
            state = 'auth';
          } else {
            send(u32(0));
            state = 'init';
          }
        } else if (state === 'auth') {
          if (buf.length < 16) return;
          const answer = buf.subarray(0, 16);
          buf = buf.subarray(16);
          state = 'checking';
          const expected = await vncResponse(password, challenge);
          if (expected.equals(answer)) {
            events.push({ type: 'auth', ok: true });
            send(u32(0));
            state = 'init';
          } else {
            events.push({ type: 'auth', ok: false });
            const reason = Buffer.from('Authentication failed');
            send(Buffer.concat([u32(1), u32(reason.length), reason]));
            ws.close();
            return;
          }
        } else if (state === 'checking') {
          return;
        } else if (state === 'init') {
          if (buf.length < 1) return;
          events.push({ type: 'init', shared: buf[0] === 1 });
          buf = buf.subarray(1);
          serverInit();
          state = 'normal';
        } else {
          if (buf.length < 1) return;
          const type = buf[0];
          const need = { 0: 20, 3: 10, 4: 8, 5: 6 }[type];
          if (need) {
            if (buf.length < need) return;
            const msg = buf.subarray(0, need);
            buf = buf.subarray(need);
            if (type === 3) {
              const incremental = msg[1] === 1;
              if (!incremental) frame();
            } else if (type === 4) {
              events.push({ type: 'key', down: msg[1] === 1, keysym: msg.readUInt32BE(4) });
            } else if (type === 5) {
              events.push({ type: 'pointer', mask: msg[1], x: msg.readUInt16BE(2), y: msg.readUInt16BE(4) });
            }
          } else if (type === 2) {
            if (buf.length < 4) return;
            const count = buf.readUInt16BE(2);
            if (buf.length < 4 + count * 4) return;
            buf = buf.subarray(4 + count * 4);
          } else if (type === 6) {
            if (buf.length < 8) return;
            const len = buf.readUInt32BE(4);
            if (buf.length < 8 + len) return;
            events.push({ type: 'clipboard', text: buf.subarray(8, 8 + len).toString('latin1') });
            buf = buf.subarray(8 + len);
          } else {
            events.push({ type: 'unknown', id: type });
            buf = Buffer.alloc(0);
            return;
          }
        }
      }
    });
    ws.on('close', () => clients.delete(ws));
  });

  await new Promise((resolve) => wss.once('listening', resolve));
  const actualPort = wss.address().port;
  return {
    port: actualPort,
    url: `ws://${host}:${actualPort}/`,
    events,
    clients,
    /** The VM puts text on its clipboard (ServerCutText). */
    sendClipboard(text) {
      const bytes = Buffer.from(String(text), 'latin1');
      for (const ws of clients) ws.send(Buffer.concat([Buffer.from([3, 0, 0, 0]), u32(bytes.length), bytes]));
    },
    /** Drops every viewer, like a VM shutting down. */
    kick() {
      for (const ws of clients) ws.close();
    },
    close() {
      for (const ws of clients) ws.terminate();
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [portArg, password] = process.argv.slice(2);
  startFakeVncServer({ port: Number(portArg) || 6080, password: password || null, width: 1024, height: 640 })
    .then((vm) => console.log(`fake VNC on ${vm.url}${password ? ' (password set)' : ''}`));
}
