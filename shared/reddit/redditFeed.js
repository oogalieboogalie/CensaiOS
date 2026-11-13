// Reddit board window helpers (no React, no DOM). A window holds one "source"
// (a subreddit or the home/popular feed). In the censaiOS desktop app the
// window loads that URL in the same native browser pane Browser uses, so
// Reddit login, cookies, voting and home work. The public JSON helpers below
// power the web-browser fallback only (Reddit refuses iframes there).

export const MAX_POSTS = 40;

const SUB_RE = /^[A-Za-z0-9_]{2,50}$/;
const SORTS = new Set(['hot', 'new', 'top', 'rising']);

/** Category chips: Home/Popular plus a few public subs. */
export const REDDIT_CATEGORIES = Object.freeze([
  { id: 'home', label: 'Home', feed: 'home', hint: 'Your feed' },
  { id: 'popular', label: 'Popular', feed: 'popular', hint: 'r/popular' },
  { id: 'pics', label: 'Pics', subreddit: 'pics', sort: 'hot', hint: 'r/pics' },
  { id: 'earth', label: 'Earth', subreddit: 'EarthPorn', sort: 'hot', hint: 'r/EarthPorn' },
  { id: 'space', label: 'Space', subreddit: 'spaceporn', sort: 'hot', hint: 'r/spaceporn' },
  { id: 'science', label: 'Science', subreddit: 'science', sort: 'hot', hint: 'r/science' },
  { id: 'tech', label: 'Tech', subreddit: 'technology', sort: 'hot', hint: 'r/technology' },
  { id: 'ask', label: 'Ask', subreddit: 'AskReddit', sort: 'hot', hint: 'r/AskReddit' },
  { id: 'funny', label: 'Funny', subreddit: 'funny', sort: 'hot', hint: 'r/funny' },
  { id: 'today', label: 'TIL', subreddit: 'todayilearned', sort: 'hot', hint: 'r/todayilearned' },
]);

export const DESKTOP_AUTH_NOTE = 'In the censaiOS desktop app this window is a real Reddit page in the same native view as Browser, so you can log in and use your account.';
export const WEB_FALLBACK_NOTE = 'In a regular web browser Reddit refuses to load inside other pages, so this window shows a public read-only feed. Use the desktop app for full login.';

export function normalizeSubreddit(name) {
  const raw = String(name || '').trim().replace(/^\/?r\//i, '');
  return SUB_RE.test(raw) ? raw : null;
}

export function normalizeSort(sort) {
  const s = String(sort || 'hot').toLowerCase();
  return SORTS.has(s) ? s : 'hot';
}

/** What the viewer typed: subreddit name, r/name, or a reddit URL. */
export function parseRedditInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (/^(home|\/)$/i.test(raw)) return { type: 'home', name: 'Home' };
  if (/^popular$/i.test(raw)) return { type: 'popular', name: 'Popular' };
  const asSub = normalizeSubreddit(raw);
  if (asSub) return { type: 'subreddit', subreddit: asSub, sort: 'hot', name: `r/${asSub}` };

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'reddit.com' && host !== 'old.reddit.com' && host !== 'new.reddit.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length) return { type: 'home', name: 'Home' };
    if (parts[0] === 'r' && normalizeSubreddit(parts[1])) {
      const sortToken = String(parts[2] || '').toLowerCase();
      const sort = SORTS.has(sortToken) ? sortToken : 'hot';
      return { type: 'subreddit', subreddit: parts[1], sort, name: `r/${parts[1]}` };
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeSource(source) {
  if (!source || typeof source !== 'object') return null;
  if (source.type === 'home' || source.feed === 'home') {
    return { type: 'home', name: String(source.name || 'Home').slice(0, 80) };
  }
  if (source.type === 'popular' || source.feed === 'popular') {
    return { type: 'popular', name: String(source.name || 'Popular').slice(0, 80) };
  }
  const subreddit = normalizeSubreddit(source.subreddit);
  if (!subreddit) return null;
  const sort = normalizeSort(source.sort);
  const name = String(source.name || `r/${subreddit}`).slice(0, 80);
  return { type: 'subreddit', subreddit, sort, name };
}

export function sourceFromCategory(cat) {
  if (!cat) return null;
  if (cat.feed === 'home') return normalizeSource({ type: 'home', name: 'Home' });
  if (cat.feed === 'popular') return normalizeSource({ type: 'popular', name: 'Popular' });
  return normalizeSource({
    type: 'subreddit',
    subreddit: cat.subreddit,
    sort: cat.sort || 'hot',
    name: `r/${cat.subreddit}`,
  });
}

export function categoryIdForSource(source) {
  const s = normalizeSource(source);
  if (!s) return null;
  if (s.type === 'home') return 'home';
  if (s.type === 'popular') return 'popular';
  return REDDIT_CATEGORIES.find((c) => c.subreddit && c.subreddit.toLowerCase() === s.subreddit.toLowerCase()
    && normalizeSort(c.sort) === s.sort)?.id || null;
}

export function sourceKey(source) {
  const s = normalizeSource(source);
  if (!s) return '';
  if (s.type === 'home') return 'home';
  if (s.type === 'popular') return 'popular';
  return `${s.subreddit}:${s.sort}`;
}

/** Reddit URL the native pane (or a new tab) should open for this source. */
export function feedUrlFor(source) {
  const s = normalizeSource(source);
  if (!s) return 'https://www.reddit.com/';
  if (s.type === 'home') return 'https://www.reddit.com/';
  if (s.type === 'popular') return 'https://www.reddit.com/r/popular/';
  return `https://www.reddit.com/r/${s.subreddit}/${s.sort}/`;
}

function decodeAmp(url) {
  return String(url || '').replace(/&amp;/g, '&');
}

function pickImage(data) {
  const source = data?.preview?.images?.[0]?.source?.url;
  if (source) return decodeAmp(source);
  if (data?.post_hint === 'image' && /^https?:\/\//i.test(data.url || '')) return data.url;
  return '';
}

function pickVideo(data) {
  const reddit = data?.media?.reddit_video?.fallback_url || data?.secure_media?.reddit_video?.fallback_url;
  if (reddit) return decodeAmp(reddit);
  return '';
}

/** One listing child → bounded post card (web fallback). Drops NSFW. */
export function normalizePost(raw) {
  const data = raw?.data || raw;
  if (!data || typeof data !== 'object') return null;
  if (data.over_18 || data.stickied) return null;
  const id = String(data.id || '').slice(0, 20);
  const title = String(data.title || '').trim().slice(0, 280);
  if (!id || !title) return null;
  const subreddit = normalizeSubreddit(data.subreddit) || 'reddit';
  const permalink = String(data.permalink || '').startsWith('/')
    ? `https://www.reddit.com${data.permalink}`
    : `https://www.reddit.com/r/${subreddit}/comments/${id}`;
  const image = pickImage(data).slice(0, 500);
  const video = pickVideo(data).slice(0, 500);
  return {
    id,
    title,
    author: String(data.author || '').slice(0, 40),
    subreddit,
    score: Number.isFinite(data.score) ? data.score : 0,
    permalink,
    url: String(data.url || permalink).slice(0, 500),
    selftext: String(data.selftext || '').slice(0, 600),
    image,
    video,
    kind: video ? 'video' : image ? 'image' : data.selftext ? 'text' : 'link',
  };
}

export function postsFromListing(listing) {
  const children = listing?.data?.children || listing?.children || [];
  const seen = new Set();
  const posts = [];
  for (const child of children) {
    const post = normalizePost(child);
    if (!post || seen.has(post.id)) continue;
    seen.add(post.id);
    posts.push(post);
    if (posts.length >= MAX_POSTS) break;
  }
  return posts;
}

export function stepIndex(length, index, delta) {
  if (!length) return 0;
  const next = index + (delta > 0 ? 1 : -1);
  if (next < 0) return 0;
  if (next >= length) return length - 1;
  return next;
}

/** @deprecated use DESKTOP_AUTH_NOTE / WEB_FALLBACK_NOTE */
export const AUTH_LIMITS_NOTE = WEB_FALLBACK_NOTE;
