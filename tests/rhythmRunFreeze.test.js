// Rhythm Run froze a computer: picking a long audio file decoded the whole
// thing (about ten times the file's size in memory) before the length check
// refused it. These guard that a track's length is checked from its header
// first, and that charting reads the channels without extra full copies.
import { jest } from '@jest/globals';
import { audioFeatures, chartFromAudio, chartFromFeatures } from '../src/lib/games/rhythm/onsets.js';
import { MAX_SECONDS, MAX_UNKNOWN_FILE, readTrack } from '../src/lib/games/rhythm/track.js';

function clicks(seconds, rate, every = 0.5) {
  const out = new Float32Array(seconds * rate);
  for (let k = 0; k < (seconds - 0.5) / every; k += 1) {
    const start = Math.floor((k * every + 0.25) * rate);
    for (let i = 0; i < rate * 0.05; i += 1) out[start + i] = Math.exp(-i / (rate * 0.01)) * Math.sin(i * (k % 2 ? 2.6 : 0.05)) * 0.8;
  }
  return out;
}

const fakeBuffer = (channels, rate) => ({
  numberOfChannels: channels.length,
  length: channels[0].length,
  sampleRate: rate,
  duration: channels[0].length / rate,
  getChannelData: (c) => channels[c],
});

const fakeFile = (size, name = 'song.mp3') => ({ size, name, arrayBuffer: jest.fn(async () => new ArrayBuffer(8)) });

describe('picking your own track', () => {
  test('an hour-long file is refused from its header, without decoding it', async () => {
    const decode = jest.fn();
    const file = fakeFile(56 * 1024 * 1024);
    const got = await readTrack(file, { probe: async () => 3500, decode });
    expect(got).toEqual({ ok: false, note: expect.stringMatching(/10 minutes/) });
    expect(decode).not.toHaveBeenCalled();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  test('a big file whose length cannot be read is refused without decoding', async () => {
    const decode = jest.fn();
    const got = await readTrack(fakeFile(MAX_UNKNOWN_FILE + 1), { probe: async () => null, decode });
    expect(got.ok).toBe(false);
    expect(decode).not.toHaveBeenCalled();
  });

  test('a file over 60 MB is refused before anything else', async () => {
    const probe = jest.fn();
    const got = await readTrack(fakeFile(61 * 1024 * 1024), { probe, decode: jest.fn() });
    expect(got.ok).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  test('a normal track decodes once and charts every difficulty', async () => {
    const rate = 22050;
    const left = clicks(8, rate);
    const decode = jest.fn(async () => fakeBuffer([left, left], rate));
    const got = await readTrack(fakeFile(2e6, 'My Song.mp3'), { probe: async () => 8, decode });
    expect(decode).toHaveBeenCalledTimes(1);
    expect(got.ok).toBe(true);
    expect(got.name).toBe('My Song');
    expect(got.charts.easy.length).toBeLessThanOrEqual(got.charts.normal.length);
    expect(got.charts.normal.length).toBeGreaterThanOrEqual(14);
  });

  test('a header that lies about the length is still caught after decoding', async () => {
    const rate = 8000;
    const long = new Float32Array((MAX_SECONDS + 1) * rate);
    const got = await readTrack(fakeFile(2e6), { probe: async () => 60, decode: async () => fakeBuffer([long], rate) });
    expect(got.ok).toBe(false);
  });
});

describe('charting reads the channels in place', () => {
  test('a stereo track charts the same as its mono mix', () => {
    const rate = 22050;
    const left = clicks(8, rate);
    const right = new Float32Array(left.length);
    const mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i += 1) mono[i] = left[i] / 2;
    const features = audioFeatures(fakeBuffer([left, right], rate));
    expect(chartFromFeatures(features, 'normal')).toEqual(chartFromAudio(mono, rate, 'normal'));
  });

  test('a ten-minute track charts quickly', () => {
    const rate = 22050;
    const one = clicks(20, rate, 0.13);
    const long = new Float32Array(600 * rate);
    for (let o = 0; o + one.length <= long.length; o += one.length) long.set(one, o);
    const started = Date.now();
    const features = audioFeatures(fakeBuffer([long], rate));
    const hard = chartFromFeatures(features, 'hard');
    expect(hard.length).toBeGreaterThan(1000);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
