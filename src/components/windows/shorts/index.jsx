/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { windowMeta } from './meta.js';
import { useShorts } from './useShorts.js';
import { ShortsSources } from './ShortsSources.jsx';
import { watchUrlFor } from '../../../lib/shorts/shortsFeed.js';

export { windowMeta };

/**
 * YouTube Shorts on the canvas. One short at a time through YouTube's own
 * embed player; scroll, swipe or arrow keys move through the feed, a tap
 * pauses. The feed (a channel's Shorts shelf, pasted links or a search) is
 * shared on the window; each person scrolls and mutes on their own.
 */
export function ShortsWindow({ win = {}, onUpdate }) {
  const s = useShorts({ win, onUpdate });
  const [sheet, setSheet] = React.useState(false);
  const item = s.source.type === 'list' ? s.source.items[Math.min(s.index, s.source.items.length - 1)] : null;
  const subtitle = s.source.type === 'list' && s.length > 1 ? `${s.source.name} · ${s.index + 1} of ${s.length}` : s.source.name;

  return (
    <>
      <WindowTitle
        icon={<Icon.Shorts size={14} />}
        label={win.title || windowMeta.label}
        subtitle={subtitle}
        actions={[
          { id: 'sound', label: null, title: s.muted ? 'Sound off' : 'Sound on', pressed: !s.muted,
            icon: s.muted ? <Icon.SpeakerOff size={14} /> : <Icon.Speaker size={14} />,
            onSelect: () => s.setMuted(!s.muted) },
          { id: 'sources', label: null, title: 'Choose what to watch', pressed: sheet, icon: <Icon.Search size={14} />, onSelect: () => setSheet(v => !v) },
        ]}
        menu={[{ id: 'open', label: 'Open on YouTube', onSelect: () => window.open(watchUrlFor(s.source, s.index), '_blank', 'noopener') }]}
      />
      <div ref={s.rootRef} className="hb-shorts" tabIndex={0} data-testid="shorts"
        onFocus={s.onFocus} onBlur={s.onBlur}
        onKeyDown={(e) => s.onKeyDown(e, { closePanel: () => (sheet ? (setSheet(false), true) : false) })}>
        <div ref={s.stageRef} className="hb-shorts-stage">
          <div className="hb-shorts-fit"><div className="hb-shorts-frame">
            <iframe
              key={s.url}
              ref={s.iframeRef}
              className="hb-shorts-player"
              src={s.url}
              title={item?.title || `${s.source.name} shorts`}
              allow="autoplay; encrypted-media; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={s.onFrameLoad}
            />
            {/* Takes taps and swipes so the canvas and the player never fight over them. */}
            <div className="hb-shorts-touch" data-testid="shorts-touch" onPointerDown={s.onPointerDown} onPointerUp={s.onPointerUp} />
            {s.paused && <div className="hb-shorts-paused" aria-hidden="true"><Icon.Play size={22} /></div>}
            {item?.title && (
              <div className="hb-shorts-caption">
                <span className="hb-shorts-caption-title">{item.title}</span>
                {item.channel && <span className="hb-shorts-caption-channel">{item.channel}</span>}
              </div>
            )}
          </div></div>
          <div className="hb-shorts-rail">
            <button type="button" className="hb-shorts-icon-btn" title="Previous short" aria-label="Previous short" disabled={s.atStart} onClick={() => s.step(-1)}><Icon.Up size={16} /></button>
            <button type="button" className="hb-shorts-icon-btn" title="Next short" aria-label="Next short" disabled={s.atEnd} onClick={() => s.step(1)}><Icon.Down size={16} /></button>
          </div>
        </div>
        {s.atEnd && s.length > 1 && (
          <div className="hb-shorts-end">End of this feed. <button type="button" className="hb-shorts-link" onClick={() => setSheet(true)}>Find more</button></div>
        )}
        {sheet && <ShortsSources source={s.source} onChoose={s.choose} onClose={() => { setSheet(false); s.rootRef.current?.focus(); }} />}
      </div>
    </>
  );
}
