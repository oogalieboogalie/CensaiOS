import React from 'react';
import {
  buyUpgrade, companyAt, contributors, earnedBetween, emptySeat, hire, readSeats, seatField, tap,
} from '../../../lib/games/idle/economy.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';

const FLUSH_MS = 400;
const TICK_MS = 100;
const SEEN_EVERY_S = 30;
const AWAY_AFTER_S = 60;
const nowSeconds = () => Date.now() / 1000;

/**
 * Agent Company state for one window. Taps are counted locally and written
 * to my own seat a few times a second; hires and upgrades write at once.
 * Everyone else's seats arrive through the shared window record.
 */
export function useAgentCompany({ win, onUpdate }) {
  const me = getSelf();
  const canPlay = me.canEdit !== false;
  const selfName = me.label || 'You';
  const field = seatField(selfName, me.id);
  // My seat from before seats were keyed by account: picked up on my next
  // write and moved under my id.
  const legacyField = seatField(selfName);

  // Remote edits hand back fresh objects; only real seat changes recompute.
  const seatsKey = React.useMemo(() => JSON.stringify(readSeats(win)), [win]);
  const seats = React.useMemo(() => JSON.parse(seatsKey), [seatsKey]);
  const seatsRef = React.useRef(seats);
  seatsRef.current = seats;
  const updateRef = React.useRef(onUpdate);
  updateRef.current = onUpdate;

  const [now, setNow] = React.useState(nowSeconds);
  React.useEffect(() => {
    const id = setInterval(() => setNow(nowSeconds()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const pending = React.useRef(0);
  const [pendingTaps, setPendingTaps] = React.useState(0);
  const company = React.useMemo(() => companyAt(seats, now), [seats, now]);
  const wallet = company.wallet + pendingTaps * company.tap;

  const writeSeat = React.useCallback((seat) => {
    const moving = legacyField !== field && seatsRef.current[legacyField];
    updateRef.current?.({ [field]: { ...seat, seenAt: nowSeconds() }, ...(moving ? { [legacyField]: null } : {}) });
  }, [field, legacyField]);

  const mySeat = React.useCallback(() => seatsRef.current[field]
    || (legacyField !== field && seatsRef.current[legacyField])
    || emptySeat(selfName, nowSeconds()), [field, legacyField, selfName]);

  const flush = React.useCallback(() => {
    const count = pending.current;
    if (!count) return;
    pending.current = 0;
    setPendingTaps(0);
    const company = companyAt(seatsRef.current, nowSeconds());
    writeSeat(tap(mySeat(), company, count));
  }, [mySeat, writeSeat]);

  React.useEffect(() => {
    const id = setInterval(flush, FLUSH_MS);
    return () => { clearInterval(id); flush(); };
  }, [flush]);

  const doTap = React.useCallback(() => {
    if (!canPlay) return 0;
    pending.current += 1;
    setPendingTaps(pending.current);
    return companyAt(seatsRef.current, nowSeconds()).tap;
  }, [canPlay]);

  // Purchases settle pending taps first so the wallet they check is current.
  const settle = React.useCallback(() => {
    const count = pending.current;
    pending.current = 0;
    setPendingTaps(0);
    const t = nowSeconds();
    let seat = mySeat();
    if (count) seat = tap(seat, companyAt(seatsRef.current, t), count);
    const others = { ...seatsRef.current, [field]: seat };
    return { seat, company: companyAt(others, t), t };
  }, [field, mySeat]);

  const doHire = React.useCallback((id) => {
    if (!canPlay) return false;
    const { seat, company, t } = settle();
    const next = hire(seat, company, id, t);
    writeSeat(next || seat);
    return Boolean(next);
  }, [canPlay, settle, writeSeat]);

  const doUpgrade = React.useCallback((id) => {
    if (!canPlay) return false;
    const { seat, company } = settle();
    const next = buyUpgrade(seat, company, id);
    writeSeat(next || seat);
    return Boolean(next);
  }, [canPlay, settle, writeSeat]);

  // "While you were away": measured from the last time this seat checked in.
  const [away, setAway] = React.useState(null);
  const checkedAway = React.useRef(false);
  React.useEffect(() => {
    if (checkedAway.current) return;
    const seat = seats[field];
    if (!seat) return;
    checkedAway.current = true;
    const t = nowSeconds();
    if (t - seat.seenAt > AWAY_AFTER_S) {
      const earned = earnedBetween(seats, seat.seenAt, t);
      if (earned >= 1) setAway({ earned, seconds: t - seat.seenAt });
    }
  }, [seats, field]);

  // Check in now and then so the next visit knows when I left.
  React.useEffect(() => {
    if (!canPlay) return undefined;
    const id = setInterval(() => {
      const seat = seatsRef.current[field];
      if (seat && nowSeconds() - seat.seenAt > SEEN_EVERY_S) writeSeat(seat);
    }, SEEN_EVERY_S * 1000);
    return () => clearInterval(id);
  }, [canPlay, field, writeSeat]);

  const team = React.useMemo(() => contributors(seats), [seats]);

  return {
    company, wallet, canPlay, selfName, field, team, away, dismissAway: () => setAway(null),
    tap: doTap, hire: doHire, upgrade: doUpgrade,
  };
}
