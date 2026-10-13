/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { getSocialFeed, getSocialMe } from '../../../lib/api/social.js';
import { windowMeta } from './meta.js';
import { FeedTab } from './FeedTab.jsx';
import { FollowingTab } from './FollowingTab.jsx';
import { ProfileTab } from './ProfileTab.jsx';

export { windowMeta };

const FEED_REFRESH_MS = 20_000;
const TABS = [
  { id: 'feed', label: 'Feed' },
  { id: 'following', label: 'Following' },
  { id: 'profile', label: 'Profile' },
];

/**
 * The social canvas: a feed of what you, the people you follow and their
 * agents are building; people and boards to follow (here or on another
 * censaiOS); and your profile with the boards you show off.
 */
export function SocialWindow({ win = {} }) {
  const [tab, setTab] = React.useState(win.tab || 'feed');
  const [feed, setFeed] = React.useState(null);
  const [me, setMe] = React.useState(null);
  const [error, setError] = React.useState('');

  const loadFeed = React.useCallback(async () => {
    try {
      const got = await getSocialFeed();
      setFeed({ items: [], boards: {}, sources: [], ...got });
      setError('');
    } catch (failure) { setError(failure.message); }
  }, []);
  const loadMe = React.useCallback(async () => {
    try {
      const got = await getSocialMe();
      if (got?.profile) setMe({ boards: [], showable: [], keys: [], ...got });
    } catch (failure) { setError(failure.message); }
  }, []);
  React.useEffect(() => { loadMe(); }, [loadMe]);
  React.useEffect(() => {
    if (tab !== 'feed') return undefined;
    loadFeed();
    const timer = setInterval(loadFeed, FEED_REFRESH_MS);
    return () => clearInterval(timer);
  }, [tab, loadFeed]);

  const name = me?.profile?.name;
  return (
    <>
      <WindowTitle
        icon={<Icon.Group size={14} />}
        label={win.title || windowMeta.label}
        subtitle={name ? `${name} · ${me.boards.length} ${me.boards.length === 1 ? 'board' : 'boards'} shown` : 'Follow, feed and profile'}
        actions={TABS.map((item) => ({ id: item.id, label: item.label, pressed: tab === item.id, onSelect: () => setTab(item.id) }))}
      />
      <div className="hb-social" data-testid="social-window" data-tab={tab}>
        <div className="hb-social-scroll">
          {error && <p className="hb-social-error" role="alert">{error}</p>}
          {tab === 'feed' && <FeedTab feed={feed} myBoards={me?.boards || []} onRefresh={loadFeed} onGoFollow={() => setTab('following')} />}
          {tab === 'following' && <FollowingTab onChanged={loadFeed} />}
          {tab === 'profile' && <ProfileTab me={me} onChanged={async () => { await loadMe(); await loadFeed(); }} />}
        </div>
      </div>
    </>
  );
}
