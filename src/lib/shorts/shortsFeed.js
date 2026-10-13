// YouTube Shorts window: the pure parts (no React, no DOM), so Jest covers
// them. A window plays one "source":
//
//   { type: 'channel', channelId, name }  a channel's Shorts shelf, played
//                                         as YouTube's own UUSH playlist
//   { type: 'list', items: [{ id, title, channel }], name }
//                                         pasted links or search results
//
// Scrolling a list moves our own index; scrolling a channel asks the player
// for its next or previous video. TikTok refuses embedding, so it is never a
// source here (the window points to the desktop browsing window instead).

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE = /^@[A-Za-z0-9._-]{3,30}$/;

export const MAX_LIST = 50;

// Channels with busy Shorts shelves, all safe for a work board. Picked when a
// window has no source and the viewer has never chosen one.
export const CURATED_CHANNELS = Object.freeze([
  { type: 'channel', channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ', name: 'NASA' },
  { type: 'channel', channelId: 'UCsXVk37bltHxD1rDPwtNM8Q', name: 'Kurzgesagt' },
  { type: 'channel', channelId: 'UCHnyfMqiRRG1u-2MsSQLbXA', name: 'Veritasium' },
  { type: 'channel', channelId: 'UCBJycsmduvYEL83R_U4JriQ', name: 'Marques Brownlee' },
]);

function asUrl(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function isYouTubeHost(host) {
  const h = String(host || '').toLowerCase().replace(/^www\.|^m\./, '');
  return h === 'youtube.com' || h === 'music.youtube.com' || h === 'youtube-nocookie.com';
}

/**
 * What the viewer typed into the source box:
 *   { type: 'video', id } | { type: 'channel', channelId } | { type: 'handle', handle }
 *   { type: 'tiktok' } | { type: 'search', query } | null (empty)
 */
export function parseShortsInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (VIDEO_ID.test(raw) && /[\d_-]/.test(raw)) return { type: 'video', id: raw };
  if (CHANNEL_ID.test(raw)) return { type: 'channel', channelId: raw };
  if (HANDLE.test(raw)) return { type: 'handle', handle: raw };

  const looksLikeUrl = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}\//i.test(raw);
  const url = looksLikeUrl ? asUrl(raw) : null;
  if (url) {
    const host = url.hostname.toLowerCase();
    if (host.endsWith('tiktok.com')) return { type: 'tiktok' };
    if (host === 'youtu.be') {
      const id = url.pathname.split('/')[1];
      if (VIDEO_ID.test(id || '')) return { type: 'video', id };
    }
    if (isYouTubeHost(host)) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live', 'v'].includes(parts[0]) && VIDEO_ID.test(parts[1] || '')) return { type: 'video', id: parts[1] };
      const v = url.searchParams.get('v');
      if (parts[0] === 'watch' && VIDEO_ID.test(v || '')) return { type: 'video', id: v };
      if (parts[0] === 'channel' && CHANNEL_ID.test(parts[1] || '')) return { type: 'channel', channelId: parts[1] };
      if (parts[0]?.startsWith('@') && HANDLE.test(parts[0])) return { type: 'handle', handle: parts[0] };
    }
    return null;
  }
  return { type: 'search', query: raw };
}

/** YouTube's Shorts-only uploads playlist for a channel: UC… becomes UUSH…. */
export function shortsPlaylistId(channelId) {
  if (!CHANNEL_ID.test(String(channelId || ''))) return null;
  return `UUSH${channelId.slice(2)}`;
}

/** A clean, bounded source, or null. Guards whatever a window record holds. */
export function normalizeSource(source) {
  if (!source || typeof source !== 'object') return null;
  if (source.type === 'channel' && CHANNEL_ID.test(String(source.channelId || ''))) {
    return { type: 'channel', channelId: source.channelId, name: String(source.name || 'Channel').slice(0, 80) };
  }
  if (source.type === 'list' && Array.isArray(source.items)) {
    const seen = new Set();
    const items = [];
    for (const item of source.items) {
      const id = typeof item === 'string' ? item : item?.id;
      if (!VIDEO_ID.test(String(id || '')) || seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        title: String(item?.title || '').slice(0, 140),
        channel: String(item?.channel || '').slice(0, 80),
      });
      if (items.length >= MAX_LIST) break;
    }
    if (!items.length) return null;
    return { type: 'list', items, name: String(source.name || (items.length === 1 ? 'Pasted short' : 'Shorts')).slice(0, 80) };
  }
  return null;
}

/** Put a pasted short at the top of the current list (or start one). */
export function withPastedVideo(source, video) {
  const current = normalizeSource(source);
  const keep = current?.type === 'list' ? current.items.filter(i => i.id !== video.id) : [];
  return normalizeSource({ type: 'list', name: keep.length ? current.name : 'Pasted short', items: [video, ...keep] });
}

/** A list source from /api/youtube/search results. */
export function sourceFromSearch(query, results) {
  return normalizeSource({
    type: 'list',
    name: String(query || 'Search').slice(0, 80),
    items: (results || []).map(r => ({ id: r.id, title: r.title, channel: r.channelTitle })),
  });
}

export function sourceKey(source) {
  const s = normalizeSource(source);
  if (!s) return '';
  return s.type === 'channel' ? `channel:${s.channelId}` : `list:${s.items.map(i => i.id).join(',')}`;
}

export function sourceLength(source) {
  const s = normalizeSource(source);
  if (!s) return 0;
  return s.type === 'list' ? s.items.length : Infinity;
}

/** The index after a step of +1 or -1; lists stop at their ends. */
export function stepIndex(source, index, delta) {
  const length = sourceLength(source);
  if (!length) return 0;
  const next = index + (delta > 0 ? 1 : -1);
  if (next < 0) return 0;
  if (next >= length) return length - 1;
  return next;
}

/**
 * The embed URL for a source at an index. Controls stay off: the window's own
 * layer takes taps (play and pause) and scrolls (next and previous), and
 * talks to the player over postMessage (enablejsapi).
 */
export function embedUrlFor(source, index = 0, { muted = true, origin = '' } = {}) {
  const s = normalizeSource(source);
  if (!s) return '';
  const params = new URLSearchParams({
    autoplay: '1', mute: muted ? '1' : '0', playsinline: '1', controls: '0',
    rel: '0', modestbranding: '1', iv_load_policy: '3', enablejsapi: '1',
  });
  if (origin) params.set('origin', origin);
  if (s.type === 'channel') {
    params.set('list', shortsPlaylistId(s.channelId));
    return `https://www.youtube.com/embed/videoseries?${params}`;
  }
  const item = s.items[Math.max(0, Math.min(index, s.items.length - 1))];
  // A one-video playlist of itself makes the short loop, like the Shorts app.
  params.set('loop', '1');
  params.set('playlist', item.id);
  return `https://www.youtube.com/embed/${item.id}?${params}`;
}

/** The message that runs one IFrame Player API command. */
export function playerCommand(func, args = []) {
  return JSON.stringify({ event: 'command', func, args });
}

export function watchUrlFor(source, index = 0) {
  const s = normalizeSource(source);
  if (!s) return 'https://www.youtube.com/shorts';
  if (s.type === 'channel') return `https://www.youtube.com/channel/${s.channelId}/shorts`;
  const item = s.items[Math.max(0, Math.min(index, s.items.length - 1))];
  return `https://www.youtube.com/shorts/${item.id}`;
}

/**
 * Turns a run of wheel events into single steps: a swipe on a trackpad sends
 * dozens of small deltas, and it should move exactly one short.
 */
export function createWheelStepper({ threshold = 60, cooldownMs = 450 } = {}) {
  let sum = 0;
  let lockedUntil = 0;
  return function feed(deltaY, now) {
    if (now < lockedUntil) return 0;
    sum += deltaY;
    if (Math.abs(sum) < threshold) return 0;
    const step = sum > 0 ? 1 : -1;
    sum = 0;
    lockedUntil = now + cooldownMs;
    return step;
  };
}
