import { afterEach, describe, expect, test } from '@jest/globals';
import { revokeShareLink } from '../server/shareLinks/store.js';
import {
  closeBoardTunnel,
  originForShare,
  resetBoardTunnel,
  takeAddressChanged,
} from '../server/shareLinks/boardTunnel.js';

const LOCAL = { headers: { host: 'localhost:3012' }, protocol: 'http', socket: { localPort: 3012 } };

function store(value = '') {
  return { read: () => value, write: (next) => { value = next; } };
}

function child() {
  const handlers = {};
  return {
    killed: false,
    exitCode: null,
    kill() { this.killed = true; },
    on(event, fn) { handlers[event] = fn; },
    exit() { this.exitCode = 0; handlers.exit?.(); },
  };
}

function tunnelDeps({ env, origin = 'https://demo.trycloudflare.com', originStore = store(), door = { port: 9, close() {} } } = {}) {
  const opened = [];
  const proc = child();
  let onOrigin = () => {};
  return {
    opened,
    proc,
    push(next) { onOrigin(next); },
    deps: {
      force: true,
      env,
      originStore,
      startDoor: async () => door,
      openTunnel: async ({ onOrigin: notify }) => {
        onOrigin = notify;
        opened.push(true);
        return { origin, child: proc };
      },
    },
  };
}

afterEach(() => { resetBoardTunnel(); });

describe('the public board address', () => {
  test('uses a configured public domain and does not open a quick tunnel', async () => {
    const rig = tunnelDeps({ env: { APP_ORIGIN: 'https://os.example.com', CENSAI_QUICK_TUNNEL: 'on', CENSAI_DOMAIN: 'app.example.com' } });
    const origin = await originForShare(LOCAL, rig.deps);
    expect(origin).toBe('https://app.example.com');
    expect(rig.opened).toHaveLength(0);
  });

  test('uses the request host when it is already public', async () => {
    const rig = tunnelDeps({ env: { APP_ORIGIN: 'http://localhost:5173', CENSAI_QUICK_TUNNEL: 'on' } });
    const origin = await originForShare({ headers: { host: 'os.example.com' }, protocol: 'https', socket: { localPort: 3001 } }, rig.deps);
    expect(origin).toBe('https://os.example.com');
    expect(rig.opened).toHaveLength(0);
  });

  test('stays shut unless the quick tunnel is turned on', async () => {
    const rig = tunnelDeps({ env: { APP_ORIGIN: 'http://localhost:5173' } });
    await expect(originForShare(LOCAL, rig.deps)).rejects.toMatchObject({ code: 'PUBLIC_LINK_UNAVAILABLE' });
    expect(rig.opened).toHaveLength(0);
  });

  test('opens a quick tunnel only when asked and no public domain is configured', async () => {
    const rig = tunnelDeps({ env: { APP_ORIGIN: 'http://localhost:5173', CENSAI_QUICK_TUNNEL: 'on' } });
    const origin = await originForShare(LOCAL, rig.deps);
    expect(origin).toBe('https://demo.trycloudflare.com');
    expect(rig.opened).toHaveLength(1);
    expect(takeAddressChanged()).toBe(false);
  });

  test('a restart that changes the tunnel address is the address the next link uses', async () => {
    const remembered = store('https://old-name.trycloudflare.com');
    const rig = tunnelDeps({
      env: { CENSAI_QUICK_TUNNEL: 'on' },
      origin: 'https://new-name.trycloudflare.com',
      originStore: remembered,
    });
    const origin = await originForShare(LOCAL, rig.deps);
    expect(origin).toBe('https://new-name.trycloudflare.com');
    expect(remembered.read()).toBe('https://new-name.trycloudflare.com');
    expect(takeAddressChanged()).toBe(true);
  });

  test('a tunnel that prints a new address stops handing out the old one', async () => {
    const rig = tunnelDeps({ env: { CENSAI_QUICK_TUNNEL: 'on' }, originStore: store() });
    expect(await originForShare(LOCAL, rig.deps)).toBe('https://demo.trycloudflare.com');
    rig.push('https://later.trycloudflare.com');
    expect(await originForShare(LOCAL, rig.deps)).toBe('https://later.trycloudflare.com');
    expect(rig.opened).toHaveLength(1);
    expect(takeAddressChanged()).toBe(true);
  });

  test('a dead tunnel is not reused', async () => {
    const rig = tunnelDeps({ env: { CENSAI_QUICK_TUNNEL: 'on' }, originStore: store() });
    await originForShare(LOCAL, rig.deps);
    rig.proc.exit();
    const again = tunnelDeps({
      env: { CENSAI_QUICK_TUNNEL: 'on' },
      origin: 'https://after-exit.trycloudflare.com',
      originStore: store('https://demo.trycloudflare.com'),
    });
    expect(await originForShare(LOCAL, again.deps)).toBe('https://after-exit.trycloudflare.com');
    expect(takeAddressChanged()).toBe(true);
  });

  test('the tunnel closes when the last share link is revoked and stays while one remains', async () => {
    const rig = tunnelDeps({ env: { CENSAI_QUICK_TUNNEL: 'on' }, originStore: store() });
    await originForShare(LOCAL, rig.deps);
    const db = {
      query: async (sql) => (/COUNT/.test(sql) ? { rows: [{ n: 1 }] } : { rows: [{ id: 'link-1' }] }),
    };
    await revokeShareLink(db, { workspaceId: 'board-a', linkId: 'link-1' });
    expect(rig.proc.killed).toBe(false);

    db.query = async (sql) => (/COUNT/.test(sql) ? { rows: [{ n: 0 }] } : { rows: [{ id: 'link-1' }] });
    await revokeShareLink(db, { workspaceId: 'board-a', linkId: 'link-1' });
    expect(rig.proc.killed).toBe(true);
    closeBoardTunnel();
  });
});
