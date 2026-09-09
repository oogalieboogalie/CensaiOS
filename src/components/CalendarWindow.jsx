import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { api } from '../lib/api.js';
import { CalendarEventComposer } from './calendar/CalendarEventComposer.jsx';
import { CalendarMonthView } from './calendar/CalendarMonthView.jsx';
import { CalendarListView } from './calendar/CalendarListView.jsx';
import { CalendarWeekHeader } from './calendar/CalendarWeekHeader.jsx';
import { CalendarDateModal } from './calendar/CalendarDateModal.jsx';
import { CalendarToolbar } from './calendar/CalendarToolbar.jsx';

// A beautifully minimal calendar UI for the infinite canvas
export function CalendarWindow({ win, onUpdate, onSpawn }) {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const persistedCalendar = win.data?.calendar || {};

  const [currentDate, setCurrentDate] = React.useState(() => (
    persistedCalendar.currentDate ? new Date(persistedCalendar.currentDate) : new Date()
  ));
  const [viewMode, setViewMode] = React.useState(persistedCalendar.viewMode || 'month'); // 'list' | 'month'
  const [selectedDateStr, setSelectedDateStr] = React.useState(persistedCalendar.selectedDateStr || null);

  // Composer State
  const [isComposing, setIsComposing] = React.useState(Boolean(persistedCalendar.isComposing));

  const persistCalendarState = React.useCallback((patch) => {
    const currentCalendar = win.data?.calendar || {};
    const nextCalendar = { ...currentCalendar, ...patch };
    const changed = Object.keys(patch).some((key) => currentCalendar[key] !== nextCalendar[key]);
    if (!changed) return;
    onUpdate({
      data: {
        ...(win.data || {}),
        calendar: nextCalendar,
      },
    });
  }, [win.data, onUpdate]);

  React.useEffect(() => {
    const nextDateIso = currentDate.toISOString();
    if (
      (persistedCalendar.viewMode || 'month') === viewMode &&
      persistedCalendar.currentDate === nextDateIso &&
      (persistedCalendar.selectedDateStr || null) === selectedDateStr &&
      Boolean(persistedCalendar.isComposing) === isComposing
    ) {
      return;
    }
    persistCalendarState({
      viewMode,
      currentDate: nextDateIso,
      selectedDateStr,
      isComposing,
    });
  }, [currentDate, isComposing, persistCalendarState, persistedCalendar.currentDate, persistedCalendar.isComposing, persistedCalendar.selectedDateStr, persistedCalendar.viewMode, selectedDateStr, viewMode]);

  const fetchEvents = React.useCallback(() => {
    setLoading(true);
    setError(null);
    let start, end;

    if (viewMode === 'month') {
      start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      // add padding to fetch full week for first/last days
      start.setDate(start.getDate() - start.getDay());
      end.setDate(end.getDate() + (6 - end.getDay()));
    } else {
      start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    }

    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    api.getCalendarEvents(start.toISOString(), end.toISOString())
      .then(data => {
        const formatted = data.map(ev => {
          const start = new Date(ev.start);
          const end = new Date(ev.end);
          const timeString = `${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
          return { id: ev.id, title: ev.title, description: ev.description, time: timeString, date: start.toISOString().split('T')[0], link: ev.link, color: ev.color };
        });
        setEvents(formatted);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [currentDate, viewMode]);

  React.useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Handle pre-fill from win.data
  React.useEffect(() => {
    if (win.data?.prefill) {
      setIsComposing(true);
    }
  }, [win.data]);




  const groupedEvents = React.useMemo(() => {
    const groups = {};
    for (const ev of events) {
      if (!groups[ev.date]) groups[ev.date] = [];
      groups[ev.date].push(ev);
    }
    return Object.entries(groups).sort((a,b) => a[0].localeCompare(b[0]));
  }, [events]);

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - d.getDay() + i);
    return d;
  });

  const monthDays = React.useMemo(() => {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const days = [];
    for (let i = 0; i < startOfMonth.getDay(); i++) Object.defineProperty(days, i, { value: null, enumerable: true }); // padding
    for (let i = 1; i <= endOfMonth.getDate(); i++) {
      days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
    }
    return days;
  }, [currentDate]);

  const isToday = (d) => new Date().toDateString() === d.toDateString();



  return (
    <>
      <WindowTitle
        accent="var(--ps-red)"
        icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>}
        label={win.title || "Calendar"}
        subtitle="Google Calendar"
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      >
        <CalendarToolbar viewMode={viewMode} setViewMode={setViewMode} currentDate={currentDate} setCurrentDate={setCurrentDate} />

      </WindowTitle>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface)', position: 'relative' }}>

        {/* Selected Date Modal */}
        {selectedDateStr && <CalendarDateModal selectedDateStr={selectedDateStr} groupedEvents={groupedEvents} onClose={() => setSelectedDateStr(null)} onSpawn={onSpawn} />}

        <CalendarWeekHeader weekDays={weekDays} viewMode={viewMode} isToday={isToday} />

        {/* Schedule View */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-faint)', fontSize: 12 }}>
              Loading events...
            </div>
          ) : error === 'Not authenticated with Google' ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-faint)', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
              <span>Not Connected</span>
              <a href="/api/auth/google" style={{ padding: '8px 16px', background: 'var(--ps-blue)', color: 'white', textDecoration: 'none', borderRadius: 6, fontWeight: 600 }}>Connect Google Calendar</a>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ps-red)', fontSize: 12 }}>
              Error: {error}
            </div>
          ) : events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-faint)', fontSize: 12 }}>
              No events scheduled for this week.
            </div>
          ) : viewMode === 'month' ? (
            <CalendarMonthView monthDays={monthDays} groupedEvents={groupedEvents} isToday={isToday} onSelectDate={setSelectedDateStr} />
          ) : (
            <CalendarListView groupedEvents={groupedEvents} onSpawn={onSpawn} />
          )}
        </div>

        {/* Event Composer */}
        {isComposing && (
          <CalendarEventComposer
            onSuccess={fetchEvents}
            onClose={() => setIsComposing(false)}
            prefillData={win.data?.prefill}
            onClearPrefill={() => onUpdate({ data: { ...win.data, prefill: null } })}
          />
        )}

        {/* Add Event Toggle */}
        {!isComposing && (
          <div style={{ padding: 12, borderTop: '1px dashed var(--hairline)' }}>
            <button
              onClick={() => setIsComposing(true)}
              style={{
                width: '100%', padding: '8px', borderRadius: 8, background: 'var(--surface-2)',
                border: '1px solid var(--hairline)', color: 'var(--ink-soft)', fontSize: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add Event
            </button>
          </div>
        )}

      </div>
    </>
  );
}
