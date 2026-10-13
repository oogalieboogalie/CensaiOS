/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import {
  CURATED_CHANNELS, createWheelStepper, embedUrlFor, normalizeSource, parseShortsInput,
  shortsPlaylistId, sourceFromSearch, stepIndex, withPastedVideo,
} from '../src/lib/shorts/shortsFeed.js';
import { ShortsWindow } from '../src/components/windows/shorts/index.jsx';
import { keyboardClaimed, releaseKeyboard } from '../src/lib/keyboardClaim.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';

const NASA = 'UCLA_DiR1FfKNvjuUpBHmylQ';

// jsdom has no PointerEvent, so pointer coordinates would be dropped.
if (typeof window.PointerEvent === 'undefined') window.PointerEvent = class PointerEvent extends MouseEvent {};

describe('shorts feed', () => {
  test('reads Shorts, watch, youtu.be and embed links as one video', () => {
    for (const link of [
      'https://www.youtube.com/shorts/aqz-KE-bpKQ',
      'youtube.com/shorts/aqz-KE-bpKQ?feature=share',
      'https://m.youtube.com/watch?v=aqz-KE-bpKQ&t=3',
      'https://youtu.be/aqz-KE-bpKQ?si=x',
      'https://www.youtube.com/embed/aqz-KE-bpKQ',
      'aqz-KE-bpKQ',
    ]) expect(parseShortsInput(link)).toEqual({ type: 'video', id: 'aqz-KE-bpKQ' });
  });

  test('reads channels, handles, TikTok and plain words', () => {
    expect(parseShortsInput(`https://www.youtube.com/channel/${NASA}/shorts`)).toEqual({ type: 'channel', channelId: NASA });
    expect(parseShortsInput('https://www.youtube.com/@NASA/shorts')).toEqual({ type: 'handle', handle: '@NASA' });
    expect(parseShortsInput('@veritasium')).toEqual({ type: 'handle', handle: '@veritasium' });
    expect(parseShortsInput('https://www.tiktok.com/@someone/video/1')).toEqual({ type: 'tiktok' });
    expect(parseShortsInput('space facts')).toEqual({ type: 'search', query: 'space facts' });
    expect(parseShortsInput('https://example.com/video')).toBeNull();
    expect(parseShortsInput('   ')).toBeNull();
  });

  test('a channel plays its Shorts-only playlist with controls off', () => {
    expect(shortsPlaylistId(NASA)).toBe('UUSHLA_DiR1FfKNvjuUpBHmylQ');
    expect(shortsPlaylistId('nope')).toBeNull();
    const url = new URL(embedUrlFor({ type: 'channel', channelId: NASA, name: 'NASA' }, 0, { muted: true, origin: 'http://localhost' }));
    expect(url.pathname).toBe('/embed/videoseries');
    expect(url.searchParams.get('list')).toBe('UUSHLA_DiR1FfKNvjuUpBHmylQ');
    expect(url.searchParams.get('controls')).toBe('0');
    expect(url.searchParams.get('enablejsapi')).toBe('1');
    expect(url.searchParams.get('mute')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('http://localhost');
  });

  test('a list plays the short at the index and loops it', () => {
    const list = { type: 'list', items: [{ id: 'aaaaaaaaaa1' }, { id: 'bbbbbbbbbb2' }] };
    const url = new URL(embedUrlFor(list, 1, { muted: false }));
    expect(url.pathname).toBe('/embed/bbbbbbbbbb2');
    expect(url.searchParams.get('loop')).toBe('1');
    expect(url.searchParams.get('playlist')).toBe('bbbbbbbbbb2');
    expect(url.searchParams.get('mute')).toBe('0');
    expect(stepIndex(list, 0, 1)).toBe(1);
    expect(stepIndex(list, 1, 1)).toBe(1);
    expect(stepIndex(list, 0, -1)).toBe(0);
  });

  test('cleans whatever a window record holds', () => {
    expect(normalizeSource(null)).toBeNull();
    expect(normalizeSource({ type: 'channel', channelId: 'x' })).toBeNull();
    expect(normalizeSource({ type: 'list', items: ['bad', { id: 'aaaaaaaaaa1' }, { id: 'aaaaaaaaaa1' }] }).items).toHaveLength(1);
    const many = { type: 'list', items: Array.from({ length: 80 }, (_, i) => ({ id: `v${String(i).padStart(10, '0')}` })) };
    expect(normalizeSource(many).items).toHaveLength(50);
  });

  test('a pasted short goes to the top of the current list', () => {
    const list = sourceFromSearch('space', [{ id: 'aaaaaaaaaa1', title: 'A', channelTitle: 'C' }, { id: 'bbbbbbbbbb2', title: 'B' }]);
    expect(list.name).toBe('space');
    const next = withPastedVideo(list, { id: 'bbbbbbbbbb2' });
    expect(next.items.map(i => i.id)).toEqual(['bbbbbbbbbb2', 'aaaaaaaaaa1']);
    expect(withPastedVideo(CURATED_CHANNELS[0], { id: 'ccccccccc_3' })).toMatchObject({ type: 'list', name: 'Pasted short', items: [{ id: 'ccccccccc_3' }] });
  });

  test('one trackpad swipe moves exactly one short', () => {
    const feed = createWheelStepper({ threshold: 60, cooldownMs: 400 });
    const steps = [10, 20, 40, 30, 50, 60].map((d, i) => feed(d, 1000 + i * 16));
    expect(steps.filter(Boolean)).toEqual([1]);
    expect(feed(-80, 2000)).toBe(-1);
  });
});

describe('Shorts window', () => {
  beforeEach(() => {
    window.localStorage.clear();
    releaseKeyboard();
  });

  test('is registered and listed under Media in the Add palette', () => {
    const manifest = WINDOW_MANIFESTS.find(m => m.kind === 'shorts');
    expect(manifest).toMatchObject({ label: 'Shorts', defaultSize: { w: 400, h: 720 } });
    const media = buildAddSections({ manifests: WINDOW_MANIFESTS }).find(s => s.label === 'Media');
    expect(media.items[0]).toMatchObject({ id: 'kind:shorts', icon: 'Shorts' });
  });

  test('plays the first curated channel when nothing is chosen', () => {
    render(<ShortsWindow win={{ id: 'w1' }} onUpdate={jest.fn()} />);
    const frame = document.querySelector('iframe.hb-shorts-player');
    expect(frame.getAttribute('src')).toContain('list=UUSHLA_DiR1FfKNvjuUpBHmylQ');
    expect(screen.getByText('NASA')).toBeTruthy();
  });

  test('steps through a list with keys and the rail, and owns the keyboard while focused', () => {
    const win = { id: 'w2', shortsSource: { type: 'list', name: 'Mine', items: [{ id: 'aaaaaaaaaa1', title: 'First' }, { id: 'bbbbbbbbbb2', title: 'Second' }] } };
    render(<ShortsWindow win={win} onUpdate={jest.fn()} />);
    const root = screen.getByTestId('shorts');
    fireEvent.focus(root);
    expect(keyboardClaimed()).toBe(true);
    expect(screen.getByText('First')).toBeTruthy();
    fireEvent.keyDown(root, { key: 'ArrowDown' });
    expect(document.querySelector('iframe').getAttribute('src')).toContain('/embed/bbbbbbbbbb2');
    expect(screen.getByText('Second')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next short' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous short' }));
    expect(document.querySelector('iframe').getAttribute('src')).toContain('/embed/aaaaaaaaaa1');
    fireEvent.keyDown(root, { key: 'Escape' });
    expect(keyboardClaimed()).toBe(false);
  });

  test('mute and pause are player commands, not reloads, and sound is remembered', () => {
    render(<ShortsWindow win={{ id: 'w3' }} onUpdate={jest.fn()} />);
    const frame = document.querySelector('iframe');
    const src = frame.getAttribute('src');
    const post = jest.fn();
    Object.defineProperty(frame, 'contentWindow', { value: { postMessage: post } });
    fireEvent.click(screen.getByTitle('Sound off'));
    expect(post).toHaveBeenCalledWith(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
    expect(JSON.parse(window.localStorage.getItem('censai.shorts')).muted).toBe(false);
    const touch = screen.getByTestId('shorts-touch');
    fireEvent.pointerDown(touch, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(touch, { clientX: 10, clientY: 11 });
    expect(post).toHaveBeenCalledWith(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
    expect(document.querySelector('iframe').getAttribute('src')).toBe(src);
  });

  test('a swipe up on a channel asks the player for the next short', () => {
    render(<ShortsWindow win={{ id: 'w4' }} onUpdate={jest.fn()} />);
    const frame = document.querySelector('iframe');
    const post = jest.fn();
    Object.defineProperty(frame, 'contentWindow', { value: { postMessage: post } });
    const touch = screen.getByTestId('shorts-touch');
    fireEvent.pointerDown(touch, { clientX: 50, clientY: 300 });
    fireEvent.pointerUp(touch, { clientX: 52, clientY: 200 });
    expect(post).toHaveBeenCalledWith(JSON.stringify({ event: 'command', func: 'nextVideo', args: [] }), '*');
  });

  test('pasting a link shares the new feed on the window and remembers it', () => {
    const onUpdate = jest.fn();
    render(<ShortsWindow win={{ id: 'w5' }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('Choose what to watch'));
    fireEvent.change(screen.getByLabelText('Shorts link, channel or search'), { target: { value: 'https://youtube.com/shorts/aqz-KE-bpKQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onUpdate).toHaveBeenCalledWith({ shortsSource: { type: 'list', name: 'Pasted short', items: [{ id: 'aqz-KE-bpKQ', title: '', channel: '' }] } });
    expect(JSON.parse(window.localStorage.getItem('censai.shorts')).last.items[0].id).toBe('aqz-KE-bpKQ');
    expect(screen.queryByTestId('shorts-sources')).toBeNull();
  });

  test('searching asks for short videos and plays the results', async () => {
    const onUpdate = jest.fn();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ items: [{ id: 'aaaaaaaaaa1', title: 'Moon', channelTitle: 'NASA' }] }) }));
    render(<ShortsWindow win={{ id: 'w6' }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('Choose what to watch'));
    fireEvent.change(screen.getByLabelText('Shorts link, channel or search'), { target: { value: 'moon landing' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go' })); });
    expect(global.fetch.mock.calls[0][0]).toBe('/api/youtube/search?q=moon%20landing&shorts=1&maxResults=25');
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ shortsSource: { type: 'list', name: 'moon landing', items: [{ id: 'aaaaaaaaaa1', title: 'Moon', channel: 'NASA' }] } }));
  });

  test('without a YouTube key, search explains that links still work', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'No YouTube API key configured.' }) }));
    render(<ShortsWindow win={{ id: 'w7' }} onUpdate={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Choose what to watch'));
    fireEvent.change(screen.getByLabelText('Shorts link, channel or search'), { target: { value: '@nasa' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go' })); });
    expect(await screen.findByText(/need a YouTube API key/)).toBeTruthy();
  });

  test('a TikTok link explains why and offers the Browser window', () => {
    render(<ShortsWindow win={{ id: 'w8' }} onUpdate={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Choose what to watch'));
    fireEvent.change(screen.getByLabelText('Shorts link, channel or search'), { target: { value: 'https://www.tiktok.com/@a/video/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(screen.getByText(/TikTok does not allow/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open TikTok in a Browser window' })).toBeTruthy();
  });
});
