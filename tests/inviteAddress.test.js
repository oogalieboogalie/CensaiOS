import { describe, expect, test } from '@jest/globals';
import { addressForOthers, inviteLink } from '../src/lib/invites/index.js';
import { chooseInviteAddress } from '../src/lib/invites/inviteAddress.js';

const CODE = 'c'.repeat(32);
const DESKTOP = { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:3012', port: '3012' };
const TAURI_WIN = { protocol: 'http:', hostname: 'tauri.localhost', origin: 'http://tauri.localhost', port: '' };
const TAURI_UNIX = { protocol: 'tauri:', hostname: 'localhost', origin: 'tauri://localhost', port: '' };

const doorOff = async () => ({
  available: false,
  thisComputerOnly: true,
  port: null,
  open: false,
  hosts: ['officepc', '192.168.1.50'],
});

describe('invite link address', () => {
  test('a saved board address is the link people open', () => {
    const where = chooseInviteAddress({
      location: DESKTOP,
      shareBase: 'https://board.example.com',
      door: { available: true, port: 3004, open: true, hosts: ['officepc'] },
    });
    expect(where.address).toBe('https://board.example.com');
    expect(where.needsAddress).toBe(false);
    expect(inviteLink(where.address, CODE)).toBe(`https://board.example.com/?invite=${CODE}`);
  });

  test('keeps a path on the saved address', () => {
    const where = chooseInviteAddress({
      location: DESKTOP,
      shareBase: 'https://x.trycloudflare.com/app//',
    });
    expect(inviteLink(where.address, CODE)).toBe(`https://x.trycloudflare.com/app/?invite=${CODE}`);
  });

  test('a public Funnel address is a real link; a localhost one is not', () => {
    const funnel = chooseInviteAddress({ location: DESKTOP, shareBase: 'https://officepc.tailnet.ts.net' });
    expect(inviteLink(funnel.address, CODE)).toBe(`https://officepc.tailnet.ts.net/?invite=${CODE}`);
    expect(funnel.needsAddress).toBe(false);
    const local = chooseInviteAddress({ location: DESKTOP, shareBase: 'http://localhost:3012' });
    expect(local.address).toBe('');
    expect(local.needsAddress).toBe(true);
  });

  test('the desktop app does not stamp its own name onto a port nothing listens on', async () => {
    const where = await addressForOthers(DESKTOP, doorOff, () => '');
    expect(where.address).toBe('');
    expect(where.needsAddress).toBe(true);
    expect(where.tryAddress).toBe('http://localhost:3012');
    expect(inviteLink(where.tryAddress, CODE)).toBe(`http://localhost:3012/?invite=${CODE}`);
    expect(where.address).not.toContain('officepc');
  });

  test('a tauri origin is never the invite link', () => {
    for (const location of [TAURI_WIN, TAURI_UNIX]) {
      const where = chooseInviteAddress({ location, shareBase: '', door: { available: false, thisComputerOnly: true, port: null, hosts: ['officepc'] } });
      expect(where.address).toBe('');
      expect(where.tryAddress).toBe('');
      expect(JSON.stringify(where)).not.toContain('tauri');
    }
  });

  test('with the board address saved, the desktop link uses it and does not ask the door', async () => {
    const readDoor = async () => { throw new Error('door should not be read'); };
    const where = await addressForOthers(TAURI_WIN, readDoor, () => 'board.example.com');
    expect(where.address).toBe('https://board.example.com');
    expect(inviteLink(where.address, CODE)).toBe(`https://board.example.com/?invite=${CODE}`);
  });

  test('Open anywhere still supplies the link when that port is listening', () => {
    const where = chooseInviteAddress({
      location: DESKTOP,
      shareBase: '',
      door: { available: true, thisComputerOnly: false, port: 3004, open: false, hosts: ['officepc'] },
    });
    expect(where.address).toBe('http://officepc:3004');
    expect(where.doorClosed).toBe(true);
    expect(inviteLink(where.address, CODE)).toBe(`http://officepc:3004/?invite=${CODE}`);
  });

  test('a page that is already public uses its own address', () => {
    const where = chooseInviteAddress({
      location: { protocol: 'https:', hostname: 'os.example.com', origin: 'https://os.example.com' },
      shareBase: '',
    });
    expect(inviteLink(where.address, CODE)).toBe(`https://os.example.com/?invite=${CODE}`);
  });
});
