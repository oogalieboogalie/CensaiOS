// Pure: what the Browser window's address bar does with what was typed.
// Shared with the server, where an agent drives an equipped Browser window.
export function parseUrl(url, { embedYoutube = true } = {}) {
  if (!url) return '';
  let finalUrl = url.trim();

  // Convert standard youtube links to embed links (iframe mode only; the
  // desktop build shows the real page).
  const ytMatch = finalUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
  if (ytMatch && ytMatch[1] && embedYoutube) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }

  // Local dev servers (localhost:5173, 127.0.0.1:3000) are addresses, not searches.
  const local = finalUrl.match(/^(https?:\/\/)?((localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/\S*)?)$/i);
  if (local) return `${local[1] || 'http://'}${local[2]}`;

  // If it contains spaces or has no dot, treat it as a web search query
  if (/\s/.test(finalUrl) || !finalUrl.includes('.')) {
    return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(finalUrl)}`;
  }

  // Ensure protocol exists
  if (!/^https?:\/\//i.test(finalUrl)) {
    finalUrl = 'https://' + finalUrl;
  }

  return finalUrl;
}
