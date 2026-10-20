/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MusicWindow } from '../src/components/MusicWindow.jsx';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';

// Each person picks the Music Player's skin; Auto (the default) follows the
// source. The pick stays after a reload and leaves one log line (skin only).

beforeAll(() => {
  const gradient = { addColorStop: () => {} };
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => gradient : () => {})),
    set: (t, k, v) => { t[k] = v; return true; },
  });
});
beforeEach(() => window.localStorage.clear());

const brand = (container) => container.querySelector('.hb-music-brand').textContent;

test('Auto follows the source; Desktop 2001 is dark metal with green digits and an equalizer strip', () => {
  const { container, unmount } = render(<MusicWindow win={{ id: 'm1' }} onUpdate={jest.fn()} />);
  const pick = screen.getByLabelText('Player skin');
  expect(pick.value).toBe('auto');
  expect(brand(container)).toBe('CensaiAudio');
  expect(container.querySelector('.hb-music-eq')).toBeNull();
  fireEvent.change(pick, { target: { value: 'desktop' } });
  expect(brand(container)).toBe('CensaiAmp');
  const device = container.querySelector('.hb-music-device');
  expect(device.style.getPropertyValue('--mp-lcd')).toBe('#3dff6e');
  expect(container.querySelectorAll('.hb-music-eq > span')).toHaveLength(7);
  expect(pendingAppLog().filter((e) => e.where === 'music').map((e) => e.message)).toContain('music: picked the Desktop 2001 skin');
  unmount();
  // After a reload the pick is still there.
  const again = render(<MusicWindow win={{ id: 'm1' }} onUpdate={jest.fn()} />);
  expect(screen.getByLabelText('Player skin').value).toBe('desktop');
  expect(brand(again.container)).toBe('CensaiAmp');
});

test('any source skin can be picked, and Auto goes back to following the source', () => {
  const { container } = render(<MusicWindow win={{ id: 'm2' }} onUpdate={jest.fn()} />);
  const pick = screen.getByLabelText('Player skin');
  fireEvent.change(pick, { target: { value: 'spotify' } });
  expect(brand(container)).toBe('Spotify');
  fireEvent.change(pick, { target: { value: 'auto' } });
  expect(brand(container)).toBe('CensaiAudio');
  expect(JSON.parse(window.localStorage.getItem('homebase.music.skin.v1'))).toEqual({});
});
