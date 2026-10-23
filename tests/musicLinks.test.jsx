/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MusicWindow } from '../src/components/MusicWindow.jsx';
import { directAudioKind, linkHost } from '../src/components/music/linkAudio.js';
import { detectMusicSource, skinFor, SOURCE_TAGS } from '../src/components/music/musicSkins.js';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';

// Song and radio links play through the window's own audio element, so the
// buttons drive real playback instead of a hidden web frame.

const made = [];
beforeAll(() => {
  const gradient = { addColorStop: () => {} };
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => gradient : () => {})),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const proto = window.HTMLMediaElement.prototype;
  Object.defineProperty(proto, 'paused', { configurable: true, get() { return !this.isPlaying; } });
  proto.play = function play() { this.isPlaying = true; this.dispatchEvent(new Event('play')); return Promise.resolve(); };
  proto.pause = function pause() { this.isPlaying = false; this.dispatchEvent(new Event('pause')); };
  const RealAudio = window.Audio;
  global.Audio = function Audio() { const a = new RealAudio(); made.push(a); return a; };
});

beforeEach(() => { made.length = 0; window.localStorage.clear(); });

const linkAudio = (url) => made.filter(a => a.getAttribute('src') === url).pop();

describe('which links play in our own player', () => {
  test('song files and radio streams, never YouTube, Spotify or SoundCloud', () => {
    expect(directAudioKind('https://example.com/music/Track%201.mp3')).toBe('song');
    expect(directAudioKind('https://cdn.example.com/a/b.m4a?sig=1')).toBe('song');
    expect(directAudioKind('https://ice2.somafm.com/groovesalad-128-mp3')).toBe('radio');
    expect(directAudioKind('https://stream.zeno.fm/abc123')).toBe('radio');
    expect(directAudioKind('http://radio.example.org:8000/live')).toBe('radio');
    expect(directAudioKind('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(directAudioKind('https://soundcloud.com/a/b')).toBeNull();
    expect(directAudioKind('https://example.com/about')).toBeNull();
    expect(directAudioKind('javascript:alert(1).mp3')).toBeNull();
    expect(linkHost('https://www.example.com/a.mp3?token=secret')).toBe('example.com');
  });

  test('a stray percent in a song link gets a result, not an error', () => {
    const url = 'https://example.com/100%.mp3';
    expect(directAudioKind(url)).toBe('song');
    const lines = pendingAppLog().filter(e => e.where === 'music');
    expect(lines.map(e => e.message)).toContain('music: could not decode a link from example.com');
    expect(lines.some(e => e.level === 'warn')).toBe(true);
    expect(lines.map(e => `${e.message} ${e.detail}`).join(' ')).not.toContain('100%');
  });

  test('radio has its own skin and tag; song links keep the MP3 player', () => {
    expect(detectMusicSource('https://ice2.somafm.com/groovesalad-128-mp3')).toBe('radio');
    expect(detectMusicSource('https://example.com/a.mp3')).toBe('generic');
    expect(skinFor('radio').brand).toBe('CensaiRadio');
    expect(skinFor('radio')).not.toBe(skinFor('generic'));
    expect(SOURCE_TAGS.radio).toBe('FM');
  });
});

describe('Music window with a song link', () => {
  const url = 'https://example.com/songs/demo.mp3';
  const win = { id: 'm1', w: 300, h: 460, musicDevice: true, src: url, trackTitle: 'Demo song', musicSource: 'generic' };

  test('plays in our player: no web frame, and the buttons drive it', async () => {
    const onUpdate = jest.fn();
    const { container } = render(<MusicWindow win={win} onUpdate={onUpdate} />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show the source player on the screen' })).toBeNull();
    const audio = linkAudio(url);
    expect(audio.crossOrigin).toBe('anonymous');
    expect(audio.isPlaying).toBe(true);
    const hub = screen.getByRole('button', { name: 'Pause' });
    expect(hub.disabled).toBe(false);
    await act(async () => { fireEvent.click(hub); });
    expect(audio.isPlaying).toBe(false);
    expect(onUpdate).toHaveBeenCalledWith({ musicPaused: true });
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  test('a site that hides its sound still plays; a dead link says so and logs it', async () => {
    render(<MusicWindow win={{ ...win, id: 'm2' }} onUpdate={jest.fn()} />);
    const first = linkAudio(url);
    await act(async () => { first.dispatchEvent(new Event('error')); });
    const second = linkAudio(url);
    expect(second).not.toBe(first);
    expect(second.crossOrigin).toBeNull();
    expect(second.isPlaying).toBe(true);
    expect(screen.getByText('VISUALIZER IS GUESSING FOR THIS SITE')).toBeTruthy();
    await act(async () => { second.dispatchEvent(new Event('error')); });
    expect(screen.getByText("CAN'T PLAY THIS LINK")).toBeTruthy();
    const lines = pendingAppLog().filter(e => e.where === 'music').map(e => e.message);
    expect(lines).toContain('music: could not play a link from example.com');
    expect(lines.join(' ')).not.toContain('demo.mp3');
  });

  test('a song a teammate loads opens the player on this board too', async () => {
    const empty = { id: 'm3', w: 300, h: 460, musicDevice: true, src: '' };
    const { container, rerender } = render(<MusicWindow win={empty} onUpdate={jest.fn()} />);
    expect(container.querySelector('[data-music-device="library"]')).toBeTruthy();
    await act(async () => { rerender(<MusicWindow win={{ ...empty, src: url, trackTitle: 'Demo song', musicSource: 'generic' }} onUpdate={jest.fn()} />); });
    expect(container.querySelector('[data-music-device="library"]')).toBeNull();
  });
});
