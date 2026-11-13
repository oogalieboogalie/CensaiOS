import React from 'react';
import { hasNativeBrowserPane, useNativeBrowserPane } from '../../../lib/nativeBrowserPane.js';
import {
  REDDIT_CATEGORIES, feedUrlFor, normalizeSource, sourceFromCategory, sourceKey,
} from '../../../lib/reddit/redditFeed.js';
import { createWheelStepper } from '../../../lib/shorts/shortsFeed.js';
import { stepIndex } from '../../../lib/reddit/redditFeed.js';

const PREFS_KEY = 'censai.reddit';
const DEFAULT = sourceFromCategory(REDDIT_CATEGORIES[1]); // Popular

function readPrefs() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePrefs(patch) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    /* private mode */
  }
}

export function useReddit({ win, onUpdate, areaRef }) {
  const [prefs] = React.useState(readPrefs);
  const source = React.useMemo(
    () => normalizeSource(win.redditSource) || normalizeSource(prefs.last) || DEFAULT,
    [win.redditSource, prefs.last],
  );
  const key = sourceKey(source);
  const url = React.useMemo(() => feedUrlFor(source), [key]);
  const native = hasNativeBrowserPane();

  const [posts, setPosts] = React.useState([]);
  const [index, setIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const stageRef = React.useRef(null);

  const pane = useNativeBrowserPane({
    winId: `reddit-${win.id || 'window'}`,
    areaRef,
    url: native ? url : '',
  });

  React.useEffect(() => {
    if (!native || !url) return undefined;
    pane.navigate(url);
    return undefined;
  }, [url, native]);

  const loadPublic = React.useCallback(async (nextSource, alive = () => true) => {
    const clean = normalizeSource(nextSource) || DEFAULT;
    if (!alive()) return;
    setBusy(true);
    setNote('');
    setIndex(0);
    try {
      const q = clean.type === 'subreddit'
        ? `subreddit=${encodeURIComponent(clean.subreddit)}&sort=${encodeURIComponent(clean.sort)}`
        : `feed=${encodeURIComponent(clean.type)}`;
      const res = await fetch(`/api/reddit/feed?${q}`);
      const data = await res.json().catch(() => ({}));
      if (!alive()) return;
      if (!res.ok) throw new Error(data.error || 'Reddit feed did not load.');
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      if (!data.posts?.length) setNote('No public posts in this feed right now.');
    } catch (err) {
      if (!alive()) return;
      setPosts([]);
      setNote(String(err?.message || err));
    } finally {
      if (alive()) setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    if (native) return undefined;
    let alive = true;
    loadPublic(source, () => alive);
    return () => { alive = false; };
  }, [key, native, loadPublic, source]);

  const choose = React.useCallback((next) => {
    const clean = normalizeSource(next);
    if (!clean) return;
    writePrefs({ last: clean });
    onUpdate?.({ redditSource: clean });
  }, [onUpdate]);

  const step = React.useCallback((delta) => {
    setIndex((i) => stepIndex(posts.length, i, delta));
  }, [posts.length]);

  React.useEffect(() => {
    if (native) return undefined;
    const el = stageRef.current;
    if (!el) return undefined;
    const stepper = createWheelStepper();
    const onWheel = (e) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const delta = stepper(e.deltaY, Date.now());
      if (delta) step(delta);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [step, native]);

  const swipe = React.useRef(null);
  const onPointerDown = React.useCallback((e) => { swipe.current = { y: e.clientY, x: e.clientX }; }, []);
  const onPointerUp = React.useCallback((e) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || native) return;
    const dy = e.clientY - start.y;
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(e.clientX - start.x)) step(dy < 0 ? 1 : -1);
  }, [step, native]);

  return {
    source, url, native, pane, posts, index, busy, note,
    post: posts[index] || null,
    atStart: index === 0, atEnd: posts.length > 0 && index >= posts.length - 1,
    stageRef, choose, step, onPointerDown, onPointerUp, reload: () => (native ? pane.reload() : loadPublic(source)),
  };
}
