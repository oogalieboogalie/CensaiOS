/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MusicWindow } from '../src/components/MusicWindow.jsx';
import { readPlayerMessage, volumeMessages } from '../src/components/music/musicUrls.js';
import {
  addToQueue, clampVolume, estimateKbps, isAudioFile, normalizeQueue, QUEUE_LIMIT, removeFromQueue,
  stepTrack, titleFromFileName,
} from '../src/components/music/musicLibrary.js';
import { readSpectrum, readVu, readWaveform, vuFromLevels } from '../src/components/music/audioSignal.js';
import { skinFor, skinVars } from '../src/components/music/musicSkins.js';

beforeAll(() => {
  const gradient = { addColorStop: () => {} };
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => gradient : () => {})),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  window.HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = function pause() {};
  global.URL.createObjectURL = jest.fn((blob) => `blob:test/${blob.name}`);
  global.URL.revokeObjectURL = jest.fn();
});

beforeEach(() => window.localStorage.clear());

describe('track lists', () => {
  test('queue adds, dedupes, removes and caps', () => {
    let q = addToQueue([], { url: 'a', title: 'A', source: 'youtube' });
    q = addToQueue(q, { url: 'b', title: 'B', source: 'spotify' });
    q = addToQueue(q, { url: 'a', title: 'A', source: 'youtube' });
    expect(q.map(i => i.url)).toEqual(['b', 'a']);
    expect(removeFromQueue(q, 'b').map(i => i.url)).toEqual(['a']);
    expect(normalizeQueue([null, { url: '' }, { url: 'x' }])).toEqual([{ url: 'x', title: 'x', source: 'generic' }]);
    const many = Array.from({ length: QUEUE_LIMIT + 5 }, (_, i) => ({ url: `u${i}` }));
    expect(normalizeQueue(many)).toHaveLength(QUEUE_LIMIT);
  });

  test('stepping wraps at both ends', () => {
    expect(stepTrack(3, 2, 1)).toBe(0);
    expect(stepTrack(3, 0, -1)).toBe(2);
    expect(stepTrack(3, -1, 1)).toBe(0);
    expect(stepTrack(0, 0, 1)).toBe(-1);
  });

  test('file helpers', () => {
    expect(titleFromFileName('01 - Daft Punk_Around the World.mp3')).toBe('Daft Punk Around the World');
    expect(isAudioFile({ name: 'x.flac', type: '' })).toBe(true);
    expect(isAudioFile({ name: 'x.png', type: 'image/png' })).toBe(false);
    expect(estimateKbps(4_800_000, 300)).toBe(128);
    expect(estimateKbps(0, 300)).toBe(0);
    expect(estimateKbps(7_056_044, 40)).toBe(0);
    expect(clampVolume(140)).toBe(100);
    expect(clampVolume('x')).toBe(80);
  });
});

describe('embed volume and track end', () => {
  test('per-viewer volume commands per source', () => {
    expect(volumeMessages('youtube', 40, false)).toEqual([
      { event: 'command', func: 'setVolume', args: [40] },
      { event: 'command', func: 'unMute', args: [] },
    ]);
    expect(volumeMessages('soundcloud', 40, true)).toEqual([{ method: 'setVolume', value: 0 }]);
    expect(volumeMessages('spotify', 40, false)).toBeNull();
  });

  test('YouTube and SoundCloud report the end of a track', () => {
    expect(readPlayerMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }))).toEqual({ playing: false, ended: true });
    expect(readPlayerMessage(JSON.stringify({ method: 'finish' }))).toEqual({ playing: false, ended: true });
  });
});

describe('real audio signal', () => {
  const fakeAnalyser = (fill) => ({
    context: { sampleRate: 44100 },
    getByteFrequencyData: (buf) => buf.fill(fill),
    getByteTimeDomainData: (buf) => { for (let i = 0; i < buf.length; i++) buf[i] = i % 2 ? 128 + fill / 2 : 128 - fill / 2; },
  });

  test('reads spectrum, waveform and VU in range', () => {
    const spectrum = readSpectrum(fakeAnalyser(255), new Float32Array(16), new Uint8Array(1024));
    expect(Array.from(spectrum).every(v => v === 1)).toBe(true);
    expect(Array.from(readSpectrum(fakeAnalyser(0), new Float32Array(16), new Uint8Array(1024))).every(v => v === 0)).toBe(true);
    const wave = readWaveform(fakeAnalyser(128), new Float32Array(8), new Uint8Array(64));
    expect(Math.max(...wave)).toBeCloseTo(0.5, 1);
    expect(readVu(fakeAnalyser(0), new Uint8Array(64))).toBe(0);
    expect(readVu(fakeAnalyser(200), new Uint8Array(64))).toBeGreaterThan(0.8);
    expect(vuFromLevels(new Float32Array(8).fill(0.5))[0]).toBeCloseTo(0.675);
  });
});

describe('device', () => {
  test('skins are flat colors exposed as CSS variables', () => {
    for (const source of ['youtube', 'ytmusic', 'spotify', 'soundcloud', 'local']) {
      const vars = skinVars(skinFor(source));
      for (const value of Object.values(vars)) expect(value).not.toMatch(/gradient/);
    }
    expect(skinFor('spotify').hub).toBe('#1db954');
  });

  test('USB files load, play only locally, and step to the next file', async () => {
    const onUpdate = jest.fn();
    const { container } = render(<MusicWindow win={{ id: 'u1', w: 300, h: 460 }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('tab', { name: 'USB' }));
    expect(screen.getByText(/Files stay on this computer/)).toBeTruthy();
    const input = container.querySelector('[data-music-file-input]');
    const files = [new File(['a'], '01 First.mp3', { type: 'audio/mpeg' }), new File(['b'], 'Second.wav', { type: 'audio/wav' })];
    await act(async () => { fireEvent.change(input, { target: { files } }); });
    expect(container.querySelector('[data-music-device="local"]')).not.toBeNull();
    expect(screen.getByText('First')).toBeTruthy();
    // Nothing about a USB file is written to the shared window.
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ src: expect.anything() }));
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(screen.getByText('Second')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  test('volume is per viewer, sent to the embed and remembered', () => {
    const onUpdate = jest.fn();
    const win = {
      id: 'v1', w: 300, h: 460, musicDevice: true, musicSource: 'youtube', trackTitle: 'Lofi',
      src: 'https://www.youtube.com/embed/abc?autoplay=1&enablejsapi=1&origin=http%3A%2F%2Flocalhost',
    };
    const { container } = render(<MusicWindow win={win} onUpdate={onUpdate} />);
    const iframe = container.querySelector('iframe');
    const postMessage = jest.fn();
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage }, configurable: true });
    const device = container.querySelector('[data-music-device="youtube"]');
    fireEvent.keyDown(device, { key: 'ArrowDown' });
    expect(postMessage.mock.calls.map(c => JSON.parse(c[0]))).toContainEqual({ event: 'command', func: 'setVolume', args: [75] });
    expect(screen.getByRole('status', { name: 'Volume 75' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mute (just for you)' }));
    expect(JSON.parse(window.localStorage.getItem('censai.music'))).toEqual({ volume: 75, muted: true });
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ volume: expect.anything() }));
  });

  test('a finished stream moves the shared queue to the next track', () => {
    const onUpdate = jest.fn();
    const a = 'https://www.youtube.com/embed/a?autoplay=1&enablejsapi=1&origin=http%3A%2F%2Flocalhost';
    const b = 'https://www.youtube.com/embed/b?autoplay=1&enablejsapi=1&origin=http%3A%2F%2Flocalhost';
    const win = {
      id: 'q1', w: 300, h: 460, musicDevice: true, musicSource: 'youtube', src: a, trackTitle: 'A',
      musicQueue: [{ url: a, title: 'A', source: 'youtube' }, { url: b, title: 'B', source: 'youtube' }],
    };
    const { container } = render(<MusicWindow win={win} onUpdate={onUpdate} />);
    const iframe = container.querySelector('iframe');
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: jest.fn() }, configurable: true });
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: iframe.contentWindow,
        data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }),
      }));
    });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ src: b, trackTitle: 'B' }));
  });

  test('MENU keeps the stream mounted and shows the shared queue', () => {
    const src = 'https://www.youtube.com/embed/a?autoplay=1&enablejsapi=1&origin=http%3A%2F%2Flocalhost';
    const win = { id: 'm1', w: 300, h: 460, musicDevice: true, musicSource: 'youtube', src, trackTitle: 'A', musicQueue: [{ url: src, title: 'A', source: 'youtube' }] };
    const { container } = render(<MusicWindow win={win} onUpdate={jest.fn()} />);
    const iframe = container.querySelector('iframe');
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    expect(container.querySelector('iframe')).toBe(iframe);
    fireEvent.click(screen.getByRole('tab', { name: /Queue/ }));
    expect(screen.getByRole('button', { name: 'Remove A' })).toBeTruthy();
    expect(screen.getByText(/Now playing: A/)).toBeTruthy();
  });
});
