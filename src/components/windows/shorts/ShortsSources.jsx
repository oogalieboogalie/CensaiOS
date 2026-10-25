/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { useWorkspaceStore } from '../../../lib/store.js';
import { logToApp } from '../../../lib/appLog/browserLog.js';
import { saveYouTubeKey, youtubeNeedsKey } from '../../../lib/youtube/keyStatus.js';
import { YouTubeKeyPrompt } from '../../youtube/YouTubeKeyPrompt.jsx';
import {
  CURATED_CHANNELS, parseShortsInput, sourceFromSearch, sourceKey, withPastedVideo,
} from '../../../lib/shorts/shortsFeed.js';

const KEY_NOTE = 'Search and @handles need a YouTube API key. Paste it here. It stays encrypted in your key vault. Pasted links and channel links work without one.';

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `YouTube request failed (${res.status})`);
    error.code = data.code || '';
    throw error;
  }
  return data;
}

function friendly(err) {
  const msg = String(err?.message || err || '');
  if (/api key/i.test(msg)) return 'Search and @handles need a YouTube API key in Settings. Pasted links and channel links work without one.';
  return msg || 'That did not work. Try a Shorts link instead.';
}

/**
 * Where the window's shorts come from: paste a link, a channel, or search.
 * Picking anything replaces what everyone on the board sees in this window.
 */
export function ShortsSources({ source, onChoose, onClose }) {
  const spawnAt = useWorkspaceStore(state => state.spawnAt);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [needsKey, setNeedsKey] = React.useState(false);
  const [tiktok, setTiktok] = React.useState(false);
  const current = sourceKey(source);

  const pick = (next) => { onChoose(next); onClose(); };

  const submit = async () => {
    const parsed = parseShortsInput(text);
    setNote('');
    setNeedsKey(false);
    setTiktok(false);
    if (!parsed) { setNote('That is not a YouTube link. Paste a Shorts link, a channel link, an @handle, or words to search.'); return; }
    if (parsed.type === 'tiktok') { setTiktok(true); return; }
    if (parsed.type === 'video') { pick(withPastedVideo(source, { id: parsed.id })); return; }
    if (parsed.type === 'channel') { pick({ type: 'channel', channelId: parsed.channelId, name: 'Channel' }); return; }
    setBusy(true);
    try {
      if (parsed.type === 'handle') {
        const data = await getJson(`/api/youtube/channel?handle=${encodeURIComponent(parsed.handle)}`);
        pick({ type: 'channel', channelId: data.channelId, name: data.name || parsed.handle });
      } else {
        const data = await getJson(`/api/youtube/search?q=${encodeURIComponent(parsed.query)}&shorts=1&maxResults=25&from=shorts`);
        const next = sourceFromSearch(parsed.query, data.items);
        if (next) pick(next);
        else setNote(`No shorts found for "${parsed.query}".`);
      }
    } catch (err) {
      if (youtubeNeedsKey(err.message, err.code)) {
        setNeedsKey(true);
        logToApp('info', 'youtube search needs a key', { where: 'shorts' });
      } else {
        setNote(friendly(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hb-shorts-sheet" role="dialog" aria-label="Choose shorts" data-testid="shorts-sources">
      <div className="hb-shorts-sheet-head">
        <span className="hb-shorts-label">Watch</span>
        <button type="button" className="hb-shorts-icon-btn" title="Close" aria-label="Close" onClick={onClose}><Icon.Close size={14} /></button>
      </div>
      <form className="hb-shorts-search" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          autoFocus
          className="hb-shorts-input"
          aria-label="Shorts link, channel or search"
          placeholder="Paste a Shorts link, @channel, or search"
          value={text}
          onChange={(e) => { setText(e.target.value); setNote(''); setTiktok(false); }}
        />
        <button type="submit" className="hb-btn" data-primary="true" disabled={!text.trim() || busy}>{busy ? 'Finding…' : 'Go'}</button>
      </form>
      {needsKey && (
        <YouTubeKeyPrompt
          who="Shorts"
          note={KEY_NOTE}
          onSave={async (apiKey) => {
            await saveYouTubeKey(apiKey);
            logToApp('info', 'youtube key saved', { where: 'shorts' });
            setNeedsKey(false);
          }}
        />
      )}
      {note && <p className="hb-shorts-note" role="status">{note}</p>}
      {tiktok && (
        <div className="hb-shorts-tiktok" role="status">
          <p className="hb-shorts-note">TikTok does not allow its videos to play inside other apps. In the desktop app, a Browser window opens TikTok as a real page.</p>
          <button type="button" className="hb-btn" onClick={() => { spawnAt('browser', { url: 'https://www.tiktok.com/' }); onClose(); }}>Open TikTok in a Browser window</button>
        </div>
      )}

      <div className="hb-shorts-label">Channels</div>
      <ul className="hb-shorts-list">
        {CURATED_CHANNELS.map((ch) => (
          <li key={ch.channelId}>
            <button type="button" className="hb-shorts-row" aria-current={current === sourceKey(ch) ? 'true' : undefined} onClick={() => pick(ch)}>
              <Icon.Shorts size={14} />
              <span className="hb-shorts-row-label">{ch.name}</span>
              {current === sourceKey(ch) && <span className="hb-shorts-row-hint">Playing</span>}
            </button>
          </li>
        ))}
      </ul>

      {source?.type === 'list' && (
        <>
          <div className="hb-shorts-label">{source.name}</div>
          <p className="hb-shorts-note">{source.items.length} {source.items.length === 1 ? 'short' : 'shorts'} in this feed.</p>
        </>
      )}

      <p className="hb-shorts-foot">Scroll, swipe or use the arrow keys for the next short. Tap to pause. TikTok works in the desktop Browser window.</p>
    </div>
  );
}
