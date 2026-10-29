import React from 'react';
import { api } from '../../lib/api.js';
import { toCalendarEvent } from './calendarEvents.js';

// What one Calendar window shows: this person's own calendar, which works
// without Google, plus Google Calendar once it is connected, earliest first.
// An answer that comes back after the person moved on to another month is
// dropped, and so is one for the old month after an add or delete.

const NOT_CONNECTED = 'Not authenticated with Google';
const settle = (fn) => Promise.resolve().then(fn);

/** The first and last moment shown: whole weeks around the month, or one week. */
export function calendarRange(currentDate, viewMode) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const start = viewMode === 'month' ? new Date(year, month, 1) : new Date(currentDate);
  start.setDate(start.getDate() - start.getDay());
  const end = viewMode === 'month' ? new Date(year, month + 1, 0) : new Date(start);
  end.setDate(end.getDate() + (viewMode === 'month' ? 6 - end.getDay() : 6));
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** connected, not-connected, not-set-up (no Google sign-in on this server) or failed. */
function googleAnswer(result) {
  if (result.status === 'fulfilled') return { status: 'connected', events: Array.isArray(result.value) ? result.value : [] };
  const err = result.reason;
  if (err?.message !== NOT_CONNECTED) return { status: 'failed', events: [] };
  return { status: err.googleSetUp === false ? 'not-set-up' : 'not-connected', events: [] };
}

export function useCalendarEvents(currentDate, viewMode) {
  const [state, setState] = React.useState({ own: [], google: [], googleStatus: 'loading', ownProblem: null, loading: true });
  const asked = React.useRef(0);
  const { start, end } = calendarRange(currentDate, viewMode);
  const from = start.toISOString();
  const to = end.toISOString();

  const load = React.useCallback(async () => {
    const ask = ++asked.current;
    setState((s) => ({ ...s, loading: true }));
    const [own, google] = await Promise.allSettled([
      settle(() => api.getMyCalendarEvents(from, to)),
      settle(() => api.getCalendarEvents(from, to)),
    ]);
    if (ask !== asked.current) return;
    const fromGoogle = googleAnswer(google);
    setState({
      own: own.status === 'fulfilled' ? own.value.map((ev) => toCalendarEvent({ ...ev, source: 'own' })) : [],
      ownProblem: own.status === 'rejected' ? own.reason?.message || 'Your calendar could not be loaded.' : null,
      google: fromGoogle.events.map((ev) => toCalendarEvent({ ...ev, source: 'google' })),
      googleStatus: fromGoogle.status,
      loading: false,
    });
  }, [from, to]);

  // An add or delete that finishes after a move to another month reloads
  // the month on screen, not the one it started in.
  const latestLoad = React.useRef(load);
  latestLoad.current = load;

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => () => { asked.current += 1; }, []);

  const add = React.useCallback(async (event, target) => {
    if (target === 'google') await api.addCalendarEvent(event);
    else await api.addMyCalendarEvent(event);
    await latestLoad.current();
  }, []);

  const remove = React.useCallback(async (id) => {
    await api.deleteMyCalendarEvent(id);
    setState((s) => ({ ...s, own: s.own.filter((ev) => ev.id !== id) }));
    await latestLoad.current();
  }, []);

  const events = React.useMemo(() => [...state.own, ...state.google].sort((a, b) => a.at - b.at), [state.own, state.google]);
  return { ...state, events, reload: load, add, remove };
}
