/**
 * @jest-environment jsdom
 */
import { parseYoutubeEmbedUrl } from '../src/components/youtube/youtubeEmbed.js';

describe('YouTube URL parser', () => {
  test('normalizes standard watch URLs', () => {
    expect(parseYoutubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    );
    expect(parseYoutubeEmbedUrl('https://youtube.com/watch?v=dQw4w9WgXcQ&t=4s')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    );
  });

  test('normalizes youtu.be short URLs', () => {
    expect(parseYoutubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?si=abcdef')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    );
  });

  test('normalizes playlist URLs', () => {
    expect(parseYoutubeEmbedUrl('https://www.youtube.com/playlist?list=PL316w8z2T4rS43-zL-49z-G3aV6V-85Z-')).toBe(
      'https://www.youtube.com/embed/videoseries?list=PL316w8z2T4rS43-zL-49z-G3aV6V-85Z-'
    );
  });

  test('normalizes shorts URLs', () => {
    expect(parseYoutubeEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    );
  });

  test('returns embed URLs directly', () => {
    expect(parseYoutubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    );
  });

  test('rejects non-YouTube URLs', () => {
    expect(parseYoutubeEmbedUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});
