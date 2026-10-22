// Which music service a link belongs to, by its real host name. Only these
// hosts are framed in the Music window; "youtube.com" somewhere else in a
// link (a look-alike host, or ?from=youtube.com) does not count.

const HOSTS = {
  'music.youtube.com': 'ytmusic',
  'youtube.com': 'youtube',
  'm.youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'youtube-nocookie.com': 'youtube',
  'open.spotify.com': 'spotify',
  'soundcloud.com': 'soundcloud',
  'm.soundcloud.com': 'soundcloud',
  'w.soundcloud.com': 'soundcloud',
};

/** The link's host name without a leading www., or '' when it is not a web link. */
export function webHost(url) {
  try {
    const u = new URL(String(url || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 'youtube', 'ytmusic', 'spotify' or 'soundcloud' for a link to that service, else null. */
export function musicHostKind(url) {
  const raw = String(url || '').trim();
  if (/^spotify:/i.test(raw)) return 'spotify';
  return HOSTS[webHost(raw)] || null;
}

export const WEB_PAGE_NOTE = 'This is a web page, not music. Open it in a Browser window.';
