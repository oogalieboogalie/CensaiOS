// Whether YouTube search has a key, and how a window saves one. The status
// answer never includes the key. A missing or unreadable answer is "unknown"
// so the search box stays up instead of flashing a paste box.

export function youtubeNeedsKey(errorText, code) {
  if (code === 'YOUTUBE_KEY_REQUIRED' || code === 'YOUTUBE_KEY_INVALID') return true;
  return /needs a key|api key|did not accept that key/i.test(String(errorText || ''));
}

export async function youtubeKeyStatus() {
  try {
    const res = await fetch('/api/youtube/key');
    if (!res || typeof res.json !== 'function' || !res.ok) return { configured: null };
    const data = await res.json();
    return { configured: Boolean(data.configured), source: data.source || null };
  } catch {
    return { configured: null };
  }
}

export async function saveYouTubeKey(apiKey) {
  const res = await fetch('/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'youtube', apiKey }),
  });
  const data = await res?.json?.().catch(() => ({})) || {};
  if (!res?.ok) throw new Error(data.error || 'Could not save the key');
}
