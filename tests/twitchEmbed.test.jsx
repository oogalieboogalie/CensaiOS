/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { cleanup, render, screen } from '@testing-library/react';
import { twitchParents, twitchPlayerUrl, twitchRefusalReason, withTwitchParent } from '../src/lib/stream/twitchEmbed.js';

const logged = [];
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logToApp: (level, message, opts) => logged.push({ level, message, where: opts?.where }),
}));
const { StreamWindow } = await import('../src/components/StreamWindow.jsx');

const at = (href) => new URL(href);
const DESKTOP_APP = at('http://tauri.localhost/');
const LAPTOP = at('http://192.168.1.20:3002/');
const OPEN_ANYWHERE = at('https://board.example.com/');
const parentsOf = (src) => new URL(src).searchParams.getAll('parent');

afterEach(() => { cleanup(); logged.length = 0; });

describe('Twitch is told the board\'s real address', () => {
  test('the desktop app\'s own address', () => {
    expect(parentsOf(twitchPlayerUrl('kaicenat', DESKTOP_APP))).toEqual(['tauri.localhost', 'localhost']);
  });

  test('a second address: the board opened from a laptop or Open anywhere', () => {
    expect(parentsOf(twitchPlayerUrl('xqc', LAPTOP))).toEqual(['192.168.1.20', 'localhost']);
    expect(parentsOf(twitchPlayerUrl('xqc', OPEN_ANYWHERE))).toEqual(['board.example.com', 'localhost']);
  });

  test('a stream saved as "localhost" is re-pointed at the page showing it', () => {
    const saved = 'https://player.twitch.tv/?channel=kaicenat&parent=localhost';
    const shown = withTwitchParent(saved, OPEN_ANYWHERE);
    expect(new URL(shown).searchParams.get('channel')).toBe('kaicenat');
    expect(parentsOf(shown)).toEqual(['board.example.com', 'localhost']);
  });

  test('YouTube and other addresses are left alone', () => {
    const yt = 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1';
    expect(withTwitchParent(yt, LAPTOP)).toBe(yt);
  });

  test('on localhost it says localhost once', () => {
    expect(twitchParents(at('http://localhost:3002/'))).toEqual(['localhost']);
  });

  test('Twitch may refuse plain http addresses other than localhost', () => {
    expect(twitchRefusalReason(at('http://localhost:5173/'))).toBeNull();
    expect(twitchRefusalReason(OPEN_ANYWHERE)).toBeNull();
    expect(twitchRefusalReason(LAPTOP)).toMatch(/https addresses or localhost.*http:\/\/192\.168\.1\.20:3002/);
  });
});

describe('Stream Viewer with a Twitch stream', () => {
  test('the player address names this page\'s host, and nothing is logged on localhost', () => {
    render(<StreamWindow win={{ id: 'w', kind: 'stream', src: 'https://player.twitch.tv/?channel=xqc&parent=localhost' }} onUpdate={() => {}} />);
    const frame = screen.getByTitle('Stream');
    expect(parentsOf(frame.getAttribute('src'))).toEqual(['localhost']);
    expect(screen.queryByRole('note')).toBeNull();
    expect(logged).toEqual([]);
  });
});
