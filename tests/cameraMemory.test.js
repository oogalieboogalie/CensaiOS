/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { loadCamera, saveCamera, saveCameraNow } from '../src/lib/cameraMemory.js';

describe('per-person camera memory', () => {
  beforeEach(() => localStorage.clear());

  test('remembers pan and zoom per workspace', () => {
    saveCameraNow('ws-1', { x: 10, y: -20, zoom: 0.5 });
    saveCameraNow('ws-2', { x: 1, y: 2, zoom: 2 });
    expect(loadCamera('ws-1')).toEqual({ x: 10, y: -20, zoom: 0.5 });
    expect(loadCamera('ws-2')).toEqual({ x: 1, y: 2, zoom: 2 });
    expect(loadCamera('ws-3')).toBeNull();
    expect(loadCamera(null)).toBeNull();
  });

  test('ignores garbage instead of breaking the canvas', () => {
    localStorage.setItem('homebase.camera.v1', '{not json');
    expect(loadCamera('ws-1')).toBeNull();
    localStorage.setItem('homebase.camera.v1', JSON.stringify({ 'ws-1': { x: 'a', y: 0, zoom: 1 }, 'ws-2': { x: 0, y: 0, zoom: 0 } }));
    expect(loadCamera('ws-1')).toBeNull();
    expect(loadCamera('ws-2')).toBeNull();
    saveCameraNow('ws-1', { x: NaN, y: 0, zoom: 1 });
    expect(loadCamera('ws-1')).toBeNull();
  });

  test('keeps only the most recent workspaces', () => {
    for (let i = 0; i < 25; i += 1) saveCameraNow(`ws-${i}`, { x: i, y: 0, zoom: 1 });
    expect(loadCamera('ws-0')).toBeNull();
    expect(loadCamera('ws-24')).toEqual({ x: 24, y: 0, zoom: 1 });
    expect(Object.keys(JSON.parse(localStorage.getItem('homebase.camera.v1')))).toHaveLength(20);
  });

  test('rapid pan/zoom collapses into one write of the last view', () => {
    jest.useFakeTimers();
    saveCamera('ws-1', { x: 1, y: 1, zoom: 1 });
    saveCamera('ws-1', { x: 5, y: 5, zoom: 1.5 });
    expect(loadCamera('ws-1')).toBeNull();
    jest.advanceTimersByTime(300);
    expect(loadCamera('ws-1')).toEqual({ x: 5, y: 5, zoom: 1.5 });
    jest.useRealTimers();
  });
});
