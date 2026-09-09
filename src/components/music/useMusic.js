import React from 'react';

function withYouTubeApi(url) {
  try {
    const u = new URL(url);
    u.searchParams.set('enablejsapi', '1');
    if (typeof window !== 'undefined') u.searchParams.set('origin', window.location.origin);
    return u.toString();
  } catch {
    return url.includes('?') ? `${url}&enablejsapi=1` : `${url}?enablejsapi=1`;
  }
}

export function parseMusicUrl(url) {
  if (!url) return '';
  // Spotify
  if (url.includes('spotify.com')) {
    if (url.includes('/embed/')) return url;
    return url.replace('spotify.com/', 'spotify.com/embed/');
  }
  // SoundCloud
  if (url.includes('soundcloud.com')) {
    if (url.includes('w.soundcloud.com')) return url;
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true`;
  }
  // YouTube
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    if (url.includes('/embed/')) return withYouTubeApi(url);
    let videoId = '';
    if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1]?.split('?')[0];
    else if (url.includes('v=')) videoId = url.split('v=')[1]?.split('&')[0];
    if (videoId) return withYouTubeApi(`https://www.youtube.com/embed/${videoId}?autoplay=1`);
  }
  return url;
}

export function isYouTubeEmbed(url) {
  return /youtube\.com\/embed\//.test(url || '');
}

export function titleFromUrl(url) {
  if (!url) return 'Current stream';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'Current stream';
  }
}

export function useMusic({ win, onUpdate }) {
  const [inputUrl, setInputUrl] = React.useState('');
  const [hovered, setHovered] = React.useState(false);
  const [paused, setPaused] = React.useState(Boolean(win.musicPaused));
  const frameRef = React.useRef(null);
  const normalizedSrc = React.useMemo(() => parseMusicUrl(win.src || ''), [win.src]);

  React.useEffect(() => {
    if (!win.src) return;
    const patch = {};
    if (normalizedSrc && normalizedSrc !== win.src) {
      patch.src = normalizedSrc;
    }
    if (!win.musicCompact) {
      patch.musicCompact = true;
      patch.h = Math.min(win.h || 104, 104);
      patch.w = Math.max(win.w || 320, 320);
    }
    if (Object.keys(patch).length > 0) {
      onUpdate(patch);
    }
  }, [win.src, normalizedSrc, win.musicCompact, onUpdate]);

  React.useEffect(() => {
    setPaused(Boolean(win.musicPaused));
  }, [win.musicPaused]);

  const loadTrack = (src, title) => {
    onUpdate({
      src: parseMusicUrl(src),
      trackTitle: title || titleFromUrl(src),
      musicCompact: true,
      musicPaused: false,
      h: 104,
      w: Math.max(win.w || 320, 320),
    });
    setPaused(false);
  };
  
  const handleLoad = () => {
    if (inputUrl.trim()) {
      loadTrack(inputUrl.trim(), titleFromUrl(inputUrl.trim()));
      setInputUrl('');
    }
  };

  const sendYouTubeCommand = (func) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func,
      args: [],
    }), '*');
  };

  const togglePlayback = () => {
    if (!isYouTubeEmbed(win.src)) return;
    const nextPaused = !paused;
    sendYouTubeCommand(nextPaused ? 'pauseVideo' : 'playVideo');
    setPaused(nextPaused);
    onUpdate({ musicPaused: nextPaused });
  };

  const clearTrack = () => {
    onUpdate({ src: '', trackTitle: '', musicCompact: false, musicPaused: false, h: Math.max(win.h || 380, 380) });
    setPaused(false);
  };

  return {
    inputUrl, setInputUrl,
    hovered, setHovered,
    paused, setPaused,
    frameRef,
    loadTrack,
    handleLoad,
    togglePlayback,
    clearTrack,
  };
}
