/**
 * Normalizes Figma URLs (design files, prototypes) into standard Figma embed URLs.
 * @param {string} url
 * @returns {string|null}
 */
export function parseFigmaEmbedUrl(url) {
  if (!url) return null;
  const cleanUrl = url.trim();

  // If already an embed URL, return it
  if (cleanUrl.includes('figma.com/embed?')) {
    return cleanUrl;
  }

  // Check if it's a valid figma.com URL
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.hostname.endsWith('figma.com') || parsed.hostname === 'figma.com') {
      const path = parsed.pathname;
      // Valid figma file paths: /file/KEY/..., /design/KEY/..., /proto/KEY/...
      if (path.startsWith('/file/') || path.startsWith('/design/') || path.startsWith('/proto/')) {
        return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(cleanUrl)}`;
      }
    }
  } catch (e) {
    // URL constructor failed
  }

  // Regex fallback
  const figmaRegex = /figma\.com\/(file|design|proto)\/([a-zA-Z0-9_]+)/;
  if (figmaRegex.test(cleanUrl)) {
    return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(cleanUrl)}`;
  }

  return null;
}

/**
 * Extracts a friendly title/label from a Figma URL or embed URL.
 * @param {string} url
 * @returns {string}
 */
export function figmaTitleFromUrl(url) {
  if (!url) return 'Figma';
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/embed') {
      const embeddedUrl = parsed.searchParams.get('url');
      if (embeddedUrl) {
        return figmaTitleFromUrl(embeddedUrl);
      }
    }
    const pathParts = parsed.pathname.split('/');
    if (pathParts.length >= 4) {
      return decodeURIComponent(pathParts[3]).replace(/[-_]/g, ' ');
    }
  } catch (e) {
    // intentional: invalid embed URLs fall through to the default title below.
  }
  
  return 'Figma Design';
}

export const FIGMA_PRESETS = [
  { name: 'Censai UI Mockups', url: 'https://www.figma.com/design/L3F9b2d8g1/Censai-UI-Mockups' }
];
