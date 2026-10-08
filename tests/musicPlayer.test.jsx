/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MusicWindow } from '../src/components/MusicWindow.jsx';
import { parseMusicUrl, readPlayerMessage } from '../src/components/music/useMusic.js';
import { detectMusicSource, formatTime, nextVisualizerMode, skinFor } from '../src/components/music/musicSkins.js';
import { synthSpectrum, tempoForSeed } from '../src/components/music/visualizerSignal.js';

// A canvas context whose every method is a no-op (gradients included), so
// the visualizer's draw loop can run under jsdom.
function noopContext() {
  const gradient = { addColorStop: () => {} };
  return new Proxy({}, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      return () => {};
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => noopContext();
});

describe('music skins', () => {
  test('detects the source a link came from', () => {
    expect(detectMusicSource('https://music.youtube.com/watch?v=abc')).toBe('ytmusic');
    expect(detectMusicSource('https://www.youtube.com/watch?v=abc')).toBe('youtube');
    expect(detectMusicSource('https://youtu.be/abc')).toBe('youtube');
    expect(detectMusicSource('spotify:track:abc')).toBe('spotify');
    expect(detectMusicSource('https://open.spotify.com/track/abc')).toBe('spotify');
    expect(detectMusicSource('https://soundcloud.com/a/b')).toBe('soundcloud');
    expect(detectMusicSource('https://example.com/stream.mp3')).toBe('generic');
  });

  test('every source has a branded skin and unknown sources fall back', () => {
    expect(skinFor('youtube').brand).toBe('YouTube');
    expect(skinFor('spotify').bodyInk).toBe('#1ed760');
    expect(skinFor('nope')).toBe(skinFor('generic'));
  });

  test('cycles visualizer modes and formats time', () => {
    expect(nextVisualizerMode('bars')).toBe('scope');
    expect(nextVisualizerMode('ambience')).toBe('bars');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('00:00');
  });
});

describe('music URLs and embed messages', () => {
  test('normalizes YouTube Music and Spotify links to embeds', () => {
    expect(parseMusicUrl('https://music.youtube.com/watch?v=abc123&list=x')).toMatch(/^https:\/\/www\.youtube\.com\/embed\/abc123\?autoplay=1&enablejsapi=1/);
    expect(parseMusicUrl('https://open.spotify.com/intl-de/track/abc123?si=x')).toBe('https://open.spotify.com/embed/track/abc123');
  });

  test('reads playback state from YouTube, SoundCloud and Spotify embeds', () => {
    expect(readPlayerMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 12.5, duration: 200, playerState: 1 } })))
      .toEqual({ position: 12.5, duration: 200, playing: true });
    expect(readPlayerMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 2 } }))).toEqual({ playing: false });
    expect(readPlayerMessage(JSON.stringify({ method: 'playProgress', value: { currentPosition: 3000 } }))).toEqual({ playing: true, position: 3 });
    expect(readPlayerMessage({ type: 'playback_update', payload: { isPaused: true, position: 4000, duration: 180000 } }))
      .toEqual({ playing: false, position: 4, duration: 180 });
    expect(readPlayerMessage('not json')).toBeNull();
  });
});

describe('visualizer signal', () => {
  test('stays in range and differs per track', () => {
    const a = synthSpectrum(1.5, 1234, new Float32Array(24));
    const b = synthSpectrum(1.5, 98765, new Float32Array(24));
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(Array.from(a)).not.toEqual(Array.from(b));
    expect(tempoForSeed(1234)).toBeGreaterThanOrEqual(84);
    expect(tempoForSeed(1234)).toBeLessThan(129);
  });
});

describe('MusicWindow', () => {
  test('library presets load with their source skin', () => {
    const onUpdate = jest.fn();
    render(<MusicWindow win={{ id: 'm1', w: 300, h: 460 }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('Lofi Beats'));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      src: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn',
      musicSource: 'spotify',
      musicDevice: true,
    }));
  });

  test('renders the YouTube device and drives the embed from the click wheel', () => {
    const onUpdate = jest.fn();
    const win = {
      id: 'm2', w: 300, h: 460, musicDevice: true, musicSource: 'youtube',
      src: parseMusicUrl('https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1'),
      trackTitle: 'Lofi Girl',
    };
    const { container } = render(<MusicWindow win={win} onUpdate={onUpdate} />);
    expect(container.querySelector('[data-music-device="youtube"]')).not.toBeNull();
    expect(container.querySelector('[data-music-visualizer="bars"]')).not.toBeNull();

    const iframe = container.querySelector('iframe');
    const postMessage = jest.fn();
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage }, configurable: true });

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({ event: 'command', func: 'pauseVideo', args: [] });
    expect(onUpdate).toHaveBeenCalledWith({ musicPaused: true });

    // The embed reports progress; the LCD shows it.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: iframe.contentWindow,
        data: JSON.stringify({ event: 'infoDelivery', info: { currentTime: 30, duration: 90, playerState: 2 } }),
      }));
    });
    expect(screen.getByText('00:30')).toBeTruthy();
    expect(screen.getByText('-01:00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds' }));
    expect(JSON.parse(postMessage.mock.calls.at(-1)[0])).toEqual({ event: 'command', func: 'seekTo', args: [40, true] });

    fireEvent.click(screen.getByRole('button', { name: 'Change visualization' }));
    expect(onUpdate).toHaveBeenCalledWith({ musicVis: 'scope' });
  });

  test('grows old 104px compact players to the device size', () => {
    const onUpdate = jest.fn();
    render(<MusicWindow win={{ id: 'm3', w: 320, h: 104, musicCompact: true, src: 'https://www.youtube.com/embed/x?enablejsapi=1&origin=http%3A%2F%2Flocalhost' }} onUpdate={onUpdate} />);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ musicDevice: true, h: 460, w: 320 }));
  });
});
