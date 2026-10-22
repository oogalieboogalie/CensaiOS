import { musicHostKind, webHost } from '../src/components/music/musicHosts.js';
import { detectMusicSource } from '../src/components/music/musicSkins.js';
import { embedKind, parseMusicUrl } from '../src/components/music/musicUrls.js';

describe('music links are known by their real host', () => {
  test.each([
    ['https://www.youtube.com/watch?v=abc123', 'youtube'],
    ['https://youtube.com/watch?v=abc123', 'youtube'],
    ['https://m.youtube.com/watch?v=abc123', 'youtube'],
    ['https://youtu.be/abc123', 'youtube'],
    ['https://www.youtube-nocookie.com/embed/abc123', 'youtube'],
    ['https://music.youtube.com/watch?v=abc123', 'ytmusic'],
    ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'spotify'],
    ['spotify:track:4uLU6hMCjMI75M1A2tKUQC', 'spotify'],
    ['https://soundcloud.com/testco/demo', 'soundcloud'],
    ['https://www.soundcloud.com/testco/demo', 'soundcloud'],
  ])('%s is %s', (url, kind) => {
    expect(musicHostKind(url)).toBe(kind);
    expect(detectMusicSource(url)).toBe(kind);
  });

  test.each([
    'https://example.com/page?from=youtube.com',
    'https://youtube.com.evil.example/watch?v=abc123',
    'https://evilyoutube.com/watch?v=abc123',
    'https://example.com/spotify.com/track/1',
    'https://soundcloud.com.example.net/testco',
    'http://example.com/?u=https://youtu.be/abc123',
  ])('a look-alike is not music: %s', (url) => {
    expect(musicHostKind(url)).toBeNull();
    expect(detectMusicSource(url)).toBe('generic');
    expect(parseMusicUrl(url)).toBe(url);
    expect(embedKind(parseMusicUrl(url))).toBe('other');
  });

  test('only web links have a host', () => {
    expect(webHost('https://WWW.Example.com/a')).toBe('example.com');
    expect(webHost(['java', 'script:alert(1)'].join(''))).toBe('');
    expect(webHost('not a link')).toBe('');
  });

  test('real links still turn into their players', () => {
    expect(parseMusicUrl('https://youtu.be/abc123')).toMatch(/^https:\/\/www\.youtube\.com\/embed\/abc123\?/);
    expect(parseMusicUrl('https://soundcloud.com/testco/demo')).toMatch(/^https:\/\/w\.soundcloud\.com\/player\//);
    expect(embedKind(parseMusicUrl('https://youtu.be/abc123'))).toBe('youtube');
  });
});
