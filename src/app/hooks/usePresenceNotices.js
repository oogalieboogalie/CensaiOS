import React from 'react';
import { createPresenceNotices } from '../../lib/collaboration/presenceNotices.js';

/**
 * The board's "joined" and "left" pop-ups, once per person. The shared
 * board's presence (`seeDoc`) and the board's live socket (`seeSocket`) each
 * report the people they can see, or null while they are not connected;
 * presenceNotices.js turns both into one notice per arrival and departure.
 */
export function usePresenceNotices(selfId) {
  const [tracker] = React.useState(() => createPresenceNotices());
  const [notices, setNotices] = React.useState([]);
  const timer = React.useRef(null);
  tracker.setSelf(selfId);

  const add = React.useCallback((fresh) => {
    if (fresh.length) setNotices((current) => [...current, ...fresh].slice(-5));
  }, []);
  const schedule = React.useCallback(() => {
    clearTimeout(timer.current);
    const wait = tracker.nextDueIn();
    if (wait === null) return;
    timer.current = setTimeout(() => {
      add(tracker.due());
      schedule();
    }, wait);
  }, [tracker, add]);
  const see = React.useCallback((channel, people) => {
    add(tracker.see(channel, people));
    schedule();
  }, [tracker, add, schedule]);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const seeDoc = React.useCallback((people) => see('doc', people), [see]);
  const seeSocket = React.useCallback((people) => see('socket', people), [see]);
  return { notices, seeDoc, seeSocket };
}
