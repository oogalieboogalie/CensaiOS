import React from 'react';

import { HBLinkButton } from './CalendarListView.jsx';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

// Deleting one of your own events asks first; the question lands on "Keep it".
function DeleteEvent({ event, asking, onAsk, onKeep, onDelete }) {
  const [problem, setProblem] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  // Keeping the event (or Escape) puts the keyboard back on its Delete button.
  const askButton = React.useRef(null);
  const wasAsking = React.useRef(false);
  React.useEffect(() => {
    if (wasAsking.current && !asking) askButton.current?.focus();
    wasAsking.current = asking;
  }, [asking]);
  const remove = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onDelete(event.id);
    } catch (err) {
      setProblem(err.message || 'The event could not be deleted.');
      setBusy(false);
    }
  };
  if (!asking) return <button type="button" ref={askButton} className="hb-cal-link" onClick={onAsk}>Delete</button>;
  return (
    <span className="hb-cal-ask" role="alertdialog" aria-label={`Delete "${event.title}"?`}>
      <span>Delete this event?</span>
      <button type="button" className="hb-cal-link" data-danger="true" disabled={busy} onClick={remove}>Delete it</button>
      <button type="button" className="hb-cal-link" autoFocus onClick={onKeep}>Keep it</button>
      {problem && <span className="hb-cal-problem" role="alert">{problem}</span>}
    </span>
  );
}

// Tab and Shift+Tab go round the open day instead of the calendar behind it.
function keepTabInside(e, box) {
  if (e.key !== 'Tab' || !box) return;
  const stops = [...box.querySelectorAll('a[href], button:not([disabled])')];
  if (!stops.length) return;
  const here = document.activeElement;
  if (e.shiftKey && (here === stops[0] || here === box)) {
    e.preventDefault();
    stops[stops.length - 1].focus();
  } else if (!e.shiftKey && here === stops[stops.length - 1]) {
    e.preventDefault();
    stops[0].focus();
  }
}

export function CalendarDateModal({ selectedDateStr, groupedEvents, onClose, onSpawn, onAddOnDay, onDelete }) {
  // The event whose "Delete this event?" question is open; Escape puts it away first.
  const [asking, setAsking] = React.useState(null);
  const titleId = React.useId();
  const box = React.useRef(null);
  const events = groupedEvents.find((g) => g[0] === selectedDateStr)?.[1] || [];
  const askingNow = events.some((ev) => ev.key === asking);
  useEscapeDismiss(true, () => (askingNow ? setAsking(null) : onClose()));
  // Opened from a day in this calendar, the keyboard moves into the day and
  // goes back to that day when it closes (a form opening next takes it
  // instead). A day a saved view reopens on load leaves the keyboard alone.
  React.useLayoutEffect(() => {
    const opener = document.activeElement;
    if (!opener || !box.current?.closest('.hb-cal')?.contains(opener)) return undefined;
    box.current.focus();
    return () => { if (opener.isConnected) opener.focus(); };
  }, []);
  const remove = async (id) => {
    await onDelete(id);
    setAsking(null);
    box.current?.focus();
  };
  const day = new Date(selectedDateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <div className="hb-cal-scrim" onClick={onClose}>
      <div
        ref={box}
        className="hb-cal-dayview"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => keepTabInside(e, box.current)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hb-cal-dayview-head">
          <span id={titleId} className="hb-cal-dayview-title">{day}</span>
          <button type="button" className="hb-cal-link" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <ul className="hb-cal-dayview-list">
          {events.length === 0 && <li className="hb-cal-muted">Nothing on this day yet.</li>}
          {events.map((ev) => (
            <li key={ev.key} className="hb-cal-entry" data-source={ev.source}>
              <span className="hb-cal-dot" style={{ background: ev.color }} />
              <div className="hb-cal-entry-body">
                {ev.link
                  ? <a className="hb-cal-entry-title" href={ev.link} target="_blank" rel="noreferrer">{ev.title}</a>
                  : <span className="hb-cal-entry-title">{ev.title}</span>}
                <span className="hb-cal-muted">{ev.time}{ev.source === 'google' ? ' · Google Calendar' : ''}</span>
                {ev.source === 'own' && ev.description && <span className="hb-cal-entry-notes">{ev.description}</span>}
                <HBLinkButton desc={ev.description} onSpawn={onSpawn} />
                {ev.source === 'own' && (
                  <DeleteEvent event={ev} asking={asking === ev.key} onAsk={() => setAsking(ev.key)} onKeep={() => setAsking(null)} onDelete={remove} />
                )}
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="hb-sched-btn" data-primary="true" onClick={() => onAddOnDay(selectedDateStr)}>
          Add event on this day
        </button>
      </div>
    </div>
  );
}
