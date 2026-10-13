import { describe, expect, test } from '@jest/globals';
import { cleanShareBase, isThisComputerOnly, shareLinkFor } from '../src/lib/workspace/shareBase.js';

const TOKEN = 'a'.repeat(43);

describe('the address share links start with', () => {
  test('localhost and the desktop app only open on this computer', () => {
    expect(isThisComputerOnly({ protocol: 'http:', hostname: 'localhost' })).toBe(true);
    expect(isThisComputerOnly({ protocol: 'http:', hostname: '127.0.0.1' })).toBe(true);
    expect(isThisComputerOnly({ protocol: 'tauri:', hostname: 'localhost' })).toBe(true);
    expect(isThisComputerOnly({ protocol: 'https:', hostname: 'board.example.com' })).toBe(false);
    expect(isThisComputerOnly({ protocol: 'http:', hostname: '192.168.1.20' })).toBe(false);
  });

  test('what the owner types becomes a clean web address', () => {
    expect(cleanShareBase('board.example.com')).toBe('https://board.example.com/');
    expect(cleanShareBase('http://192.168.1.20:3002/')).toBe('http://192.168.1.20:3002/');
    expect(cleanShareBase('https://x.trycloudflare.com/app//')).toBe('https://x.trycloudflare.com/app/');
    expect(cleanShareBase('')).toBe('');
    expect(cleanShareBase('javascript:alert(1)')).toBe('');
  });

  test('without a saved address the link uses this browser\'s address', () => {
    expect(shareLinkFor(TOKEN, { origin: 'https://board.example.com', pathname: '/' })).toBe(`https://board.example.com/?join=${TOKEN}`);
    expect(shareLinkFor('short', { origin: 'https://board.example.com', pathname: '/' })).toBe('');
  });
});
