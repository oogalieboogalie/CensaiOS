import React from 'react';
import {
  buyMaker, buyUpgrade, dig, dugBetween, economyAt, emptyYardSeat, readYardSeats, yardField,
} from '../../../lib/games/blocks/economy.js';
import { builders, isoUnlocked, landSize, placeBlock, stacksOf, takeBlock } from '../../../lib/games/blocks/yard.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';

const FLUSH_MS = 400;
const TICK_MS = 100;
const SEEN_EVERY_S = 30;
const AWAY_AFTER_S = 60;
const nowSeconds = () => Date.now() / 1000;

/**
 * Blockyard state for one window. Digs are counted locally and written to my
 * own seat a few times a second; building, makers and upgrades write at once.
 * Everyone else's seats arrive through the shared window record.
 */
export function useIdleBlocks({ win, onUpdate }) {
  const me = getSelf();
  const canPlay = me.canEdit !== false;
  const selfName = me.label || 'You';
  const field = yardField(selfName);

  // Remote edits hand back fresh objects; only real seat changes recompute.
  const seatsKey = React.useMemo(() => JSON.stringify(readYardSeats(win)), [win]);
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
  const [pendingDigs, setPendingDigs] = React.useState(0);
  const eco = React.useMemo(() => economyAt(seats, now), [seats, now]);
  const wallet = eco.wallet + pendingDigs * eco.dig;
  const earned = eco.earned + pendingDigs * eco.dig;
  const size = landSize(earned);
  const stacks = React.useMemo(() => stacksOf(seats, size), [seats, size]);

  const writeSeat = React.useCallback((seat) => {
    updateRef.current?.({ [field]: { ...seat, seenAt: nowSeconds() } });
  }, [field]);

  const mySeat = React.useCallback(() => seatsRef.current[field] || emptyYardSeat(selfName, nowSeconds()), [field, selfName]);

  const flush = React.useCallback(() => {
    const count = pending.current;
    if (!count) return;
    pending.current = 0;
    setPendingDigs(0);
    writeSeat(dig(mySeat(), economyAt(seatsRef.current, nowSeconds()), count));
  }, [mySeat, writeSeat]);

  React.useEffect(() => {
    const id = setInterval(flush, FLUSH_MS);
    return () => { clearInterval(id); flush(); };
  }, [flush]);

  const doDig = React.useCallback(() => {
    if (!canPlay) return 0;
    pending.current += 1;
    setPendingDigs(pending.current);
    return economyAt(seatsRef.current, nowSeconds()).dig;
  }, [canPlay]);

  // Spending settles pending digs first so the wallet it checks is current.
  const settle = React.useCallback(() => {
    const count = pending.current;
    pending.current = 0;
    setPendingDigs(0);
    const t = nowSeconds();
    let seat = mySeat();
    if (count) seat = dig(seat, economyAt(seatsRef.current, t), count);
    const all = { ...seatsRef.current, [field]: seat };
    const e = economyAt(all, t);
    return { seat, eco: e, t, all };
  }, [field, mySeat]);

  const spend = React.useCallback((change) => {
    if (!canPlay) return false;
    const ctx = settle();
    const next = change(ctx);
    writeSeat(next || ctx.seat);
    return Boolean(next);
  }, [canPlay, settle, writeSeat]);

  const place = React.useCallback((x, y, id) => spend(({ seat, eco: e, all }) => {
    const s = landSize(e.earned);
    return placeBlock(seat, e, stacksOf(all, s), s, x, y, id);
  }), [spend]);
  const take = React.useCallback((x, y) => spend(({ seat }) => takeBlock(seat, x, y)), [spend]);
  const buy = React.useCallback((id) => spend(({ seat, eco: e, t }) => buyMaker(seat, e, id, t)), [spend]);
  const upgrade = React.useCallback((id) => spend(({ seat, eco: e }) => buyUpgrade(seat, e, id)), [spend]);

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
      const got = dugBetween(seats, seat.seenAt, t);
      if (got >= 1) setAway({ earned: got, seconds: t - seat.seenAt });
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

  const team = React.useMemo(() => builders(seats), [seats]);

  return {
    eco, wallet, earned, size, stacks, canPlay, field, team, away, dismissAway: () => setAway(null),
    iso: isoUnlocked(earned), dig: doDig, place, take, buy, upgrade,
  };
}
