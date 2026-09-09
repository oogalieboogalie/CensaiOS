/**
 * @jest-environment jsdom
 */
import { parseFigmaEmbedUrl, figmaTitleFromUrl } from '../src/components/figma/figmaEmbed.js';

describe('Figma URL parser', () => {
  test('normalizes standard design file URLs', () => {
    const original = 'https://www.figma.com/design/L3F9b2d8g1/Censai-UI-Mockups';
    expect(parseFigmaEmbedUrl(original)).toBe(
      `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(original)}`
    );
  });

  test('normalizes legacy file URLs', () => {
    const original = 'https://figma.com/file/L3F9b2d8g1/Censai-UI-Mockups';
    expect(parseFigmaEmbedUrl(original)).toBe(
      `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(original)}`
    );
  });

  test('normalizes prototype URLs', () => {
    const original = 'https://www.figma.com/proto/L3F9b2d8g1/Censai-UI-Mockups?node-id=1-2';
    expect(parseFigmaEmbedUrl(original)).toBe(
      `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(original)}`
    );
  });

  test('returns embed URLs directly', () => {
    const original = 'https://www.figma.com/embed?embed_host=share&url=something';
    expect(parseFigmaEmbedUrl(original)).toBe(original);
  });

  test('extracts title correctly from design URL', () => {
    expect(figmaTitleFromUrl('https://www.figma.com/design/L3F9b2d8g1/Censai-UI-Mockups')).toBe(
      'Censai UI Mockups'
    );
    expect(figmaTitleFromUrl('https://www.figma.com/design/L3F9b2d8g1/My_Cool_Design-File')).toBe(
      'My Cool Design File'
    );
  });

  test('rejects non-Figma URLs', () => {
    expect(parseFigmaEmbedUrl('https://example.com/file/L3F9b2d8g1')).toBeNull();
  });
});
