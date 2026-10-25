/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { useLocalAudio } from '../src/components/music/useLocalAudio.js';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';

// A file from this computer that the browser cannot decode (a text file
// named song.mp3): the player must not claim PLAYING, and says so plainly.

const made = [];
beforeAll(() => {
  const proto = window.HTMLMediaElement.prototype;
  Object.defineProperty(proto, 'paused', { configurable: true, get() { return !this.isPlaying; } });
  proto.play = function play() { this.isPlaying = true; this.dispatchEvent(new Event('play')); return Promise.resolve(); };
  proto.pause = function pause() { this.isPlaying = false; this.dispatchEvent(new Event('pause')); };
  const RealAudio = window.Audio;
  global.Audio = function Audio() { const a = new RealAudio(); made.push(a); return a; };
});

function Probe({ track, onState }) {
  const audio = useLocalAudio({ track, volume: 80, muted: false });
  onState(audio);
  return null;
}

const fail = (audio) => {
  // What the browser does with a file it cannot decode (MEDIA_ERR_SRC_NOT_SUPPORTED).
  Object.defineProperty(audio, 'error', { configurable: true, value: { code: 4 } });
  audio.dispatchEvent(new Event('error'));
};

describe('a broken file from this computer', () => {
  test('is not shown as playing, says it could not be played, and logs no file name', async () => {
    let state;
    const track = { id: 'usb-1', url: 'blob:http://localhost/not-really-a-song', title: 'Pat secret mix' };
    render(<Probe track={track} onState={(s) => { state = s; }} />);
    await act(async () => { state.play(); });
    const audio = made.find((a) => a.getAttribute('src') === track.url);
    expect(state.playing).toBe(true);

    await act(async () => { fail(audio); });
    expect(state.playing).toBe(false);
    expect(audio.isPlaying).toBe(false);
    expect(state.problem).toBe('This file could not be played.');

    const lines = pendingAppLog().filter((e) => e.where === 'music').map((e) => e.message);
    expect(lines).toContain('music: could not play a file from this computer');
    expect(lines.join(' ')).not.toMatch(/Pat secret|not-really|blob:/);
  });

  test('a good file picked after it plays and clears the message', async () => {
    let state;
    const broken = { id: 'usb-1', url: 'blob:http://localhost/broken' };
    const good = { id: 'usb-2', url: 'blob:http://localhost/good' };
    const { rerender } = render(<Probe track={broken} onState={(s) => { state = s; }} />);
    await act(async () => { state.play(); });
    await act(async () => { fail(made.find((a) => a.getAttribute('src') === broken.url)); });
    expect(state.problem).toBe('This file could not be played.');

    rerender(<Probe track={good} onState={(s) => { state = s; }} />);
    const audio = made.find((a) => a.getAttribute('src') === good.url);
    Object.defineProperty(audio, 'error', { configurable: true, value: null });
    await act(async () => { state.play(); });
    expect(state.problem).toBe('');
    expect(state.playing).toBe(true);
  });
});
