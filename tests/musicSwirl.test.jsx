/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import { jest } from '@jest/globals';

const logLines = [];
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logToApp: (level, message, options) => logLines.push({ level, message, options }),
}));

const { MusicVisualizer } = await import('../src/components/music/MusicVisualizer.jsx');
const { drawSwirl, swirlEnergy, swirlFeedback } = await import('../src/components/music/visualizerSwirl.js');
const { skinFor, VISUALIZER_LABELS, VISUALIZER_MODES } = await import('../src/components/music/musicSkins.js');

// A canvas context that counts every drawing call by name.
function countingContext(calls, canvas = { width: 100, height: 50 }) {
  return new Proxy({ canvas }, {
    get: (target, key) => {
      if (key in target) return target[key];
      return (...args) => { calls.push(String(key)); return { addColorStop: () => {}, args }; };
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
}

let frames = [];
let calls = [];
let reduceMotion = false;

beforeEach(() => {
  frames = [];
  calls = [];
  logLines.length = 0;
  reduceMotion = false;
  HTMLCanvasElement.prototype.getContext = function getContext() { return countingContext(calls, this); };
  HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ width: 240, height: 120 });
  window.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  window.cancelAnimationFrame = () => {};
  window.matchMedia = () => ({ matches: reduceMotion, addEventListener: () => {}, removeEventListener: () => {} });
});

// Run queued animation frames, one at a time, up to `limit`.
function runFrames(limit) {
  let ran = 0;
  let now = 1000;
  while (frames.length && ran < limit) {
    const fn = frames.shift();
    now += 16;
    act(() => fn(now));
    ran += 1;
  }
  return ran;
}

const skin = skinFor('local');
const fakeSignal = null;

describe('swirl visualizer', () => {
  test('is one of the modes the VIS button cycles through', () => {
    expect(VISUALIZER_MODES).toContain('swirl');
    expect(VISUALIZER_LABELS.swirl).toBe('SWIRL');
  });

  test('louder bass turns and zooms the spiral harder', () => {
    const quiet = swirlFeedback(swirlEnergy(new Float32Array(12).fill(0.05)));
    const loud = swirlFeedback(swirlEnergy(new Float32Array(12).fill(0.9)));
    expect(loud.turn).toBeGreaterThan(quiet.turn);
    expect(loud.zoom).toBeGreaterThan(quiet.zoom);
  });

  test('a still frame clears and draws no trails', () => {
    const drawn = [];
    drawSwirl(countingContext(drawn), 100, 50, new Float32Array(12).fill(0.4), 0, skin, { still: true });
    expect(drawn).toContain('clearRect');
    expect(drawn).not.toContain('drawImage');
    expect(drawn).toContain('fill');
  });

  test('keeps drawing while playing and stops drawing once paused', () => {
    const view = render(<MusicVisualizer mode="swirl" skin={skin} playing seed={7} signal={fakeSignal} windowId="win-pat" />);
    expect(runFrames(30)).toBe(30);
    expect(frames.length).toBe(1);
    expect(calls).toContain('drawImage');

    view.rerender(<MusicVisualizer mode="swirl" skin={skin} playing={false} seed={7} signal={fakeSignal} windowId="win-pat" />);
    const ran = runFrames(2000);
    expect(ran).toBeLessThan(2000);
    expect(frames.length).toBe(0);
    const drawnSoFar = calls.length;
    runFrames(50);
    expect(calls.length).toBe(drawnSoFar);
  });

  test('with less motion it holds one still picture and stops', () => {
    reduceMotion = true;
    render(<MusicVisualizer mode="swirl" skin={skin} playing seed={7} signal={fakeSignal} windowId="win-sam" />);
    const ran = runFrames(2000);
    expect(ran).toBeLessThan(2000);
    expect(frames.length).toBe(0);
    expect(calls).not.toContain('drawImage');
  });

  test('logs once per track when it falls back to the made-up beat, naming only the window', () => {
    const view = render(<MusicVisualizer mode="swirl" skin={skin} playing seed={7} signal={null} windowId="win-mo" />);
    view.rerender(<MusicVisualizer mode="bars" skin={skin} playing seed={7} signal={null} windowId="win-mo" />);
    expect(logLines).toHaveLength(1);
    expect(logLines[0].message).toBe("music: visualizer can't read the sound in window win-mo, so it follows a made-up beat");
    expect(logLines[0].options).toEqual({ where: 'music' });
    view.rerender(<MusicVisualizer mode="bars" skin={skin} playing seed={8} signal={null} windowId="win-mo" />);
    expect(logLines).toHaveLength(2);
  });

  test('says nothing when it can read the real sound', () => {
    const analyser = { frequencyBinCount: 32, fftSize: 64, getByteFrequencyData: () => {}, getByteTimeDomainData: () => {} };
    const signal = { analyser, left: analyser, right: analyser };
    render(<MusicVisualizer mode="swirl" skin={skin} playing seed={7} signal={signal} windowId="win-jordan" />);
    runFrames(5);
    expect(logLines).toHaveLength(0);
  });
});
