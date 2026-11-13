/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { hiddenMessage } from '../../../lib/paneCover.js';
import { windowMeta } from './meta.js';
import { useReddit } from './useReddit.js';
import { RedditChips } from './RedditChips.jsx';
import { RedditSources } from './RedditSources.jsx';
import { RedditPost } from './RedditPost.jsx';
import { WEB_FALLBACK_NOTE } from '../../../lib/reddit/redditFeed.js';

export { windowMeta };

/**
 * Reddit on the canvas. Desktop (Tauri) loads the real site in the same native
 * browser pane as Browser — login and scrolling work there. Category chips and
 * the sources sheet pick Home, Popular or a subreddit. On a plain web browser
 * Reddit refuses iframes, so this window falls back to a public read-only feed.
 */
export function RedditWindow({ win = {}, onUpdate }) {
  const areaRef = React.useRef(null);
  const r = useReddit({ win, onUpdate, areaRef });
  const [sheet, setSheet] = React.useState(false);
  const subtitle = r.source.name || 'Reddit';

  return (
    <>
      <WindowTitle
        icon={<Icon.Reddit size={14} />}
        label={win.title || windowMeta.label}
        subtitle={subtitle}
        actions={[
          { id: 'reload', label: null, title: 'Reload', icon: <Icon.Refresh size={14} />, onSelect: () => r.reload() },
          { id: 'sources', label: null, title: 'Choose feed', pressed: sheet, icon: <Icon.Search size={14} />, onSelect: () => setSheet((v) => !v) },
        ]}
        menu={[{ id: 'open', label: 'Open on Reddit', onSelect: () => window.open(r.url, '_blank', 'noopener') }]}
      />
      <div className="hb-reddit" data-testid="reddit" data-mode={r.native ? 'native' : 'public'}>
        {r.native ? (
          <div ref={areaRef} className="hb-reddit-native" data-testid="reddit-native">
            <span className="hb-reddit-native-msg">
              {r.pane.visible ? 'Loading Reddit' : hiddenMessage(r.pane.hiddenBy)}
            </span>
          </div>
        ) : (
          <div
            ref={r.stageRef}
            className="hb-reddit-stage"
            data-testid="reddit-stage"
            onPointerDown={r.onPointerDown}
            onPointerUp={r.onPointerUp}
          >
            {r.busy && <p className="hb-reddit-note">Loading public feed…</p>}
            {!r.busy && r.note && <p className="hb-reddit-note" role="status">{r.note}</p>}
            {!r.busy && !r.note && <RedditPost post={r.post} />}
            {!r.busy && r.posts.length > 1 && (
              <div className="hb-reddit-rail">
                <button type="button" className="hb-reddit-icon-btn" title="Previous" aria-label="Previous post" disabled={r.atStart} onClick={() => r.step(-1)}><Icon.Up size={16} /></button>
                <button type="button" className="hb-reddit-icon-btn" title="Next" aria-label="Next post" disabled={r.atEnd} onClick={() => r.step(1)}><Icon.Down size={16} /></button>
              </div>
            )}
            <p className="hb-reddit-web-note">{WEB_FALLBACK_NOTE}</p>
          </div>
        )}
        <RedditChips source={r.source} onPick={r.choose} />
        {sheet && (
          <RedditSources
            source={r.source}
            native={r.native}
            onChoose={r.choose}
            onClose={() => setSheet(false)}
          />
        )}
      </div>
    </>
  );
}
