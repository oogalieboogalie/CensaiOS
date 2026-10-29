import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { CalendarEventComposer } from './calendar/CalendarEventComposer.jsx';
import { CalendarMonthView } from './calendar/CalendarMonthView.jsx';
import { CalendarListView } from './calendar/CalendarListView.jsx';
import { CalendarWeekHeader } from './calendar/CalendarWeekHeader.jsx';
import { CalendarDateModal } from './calendar/CalendarDateModal.jsx';
import { CalendarToolbar } from './calendar/CalendarToolbar.jsx';
import { CalendarFooter } from './calendar/CalendarFooter.jsx';
import { useCalendarEvents } from './calendar/useCalendarEvents.js';
import { loadCalendarView, logCalendarViewSetAside, saveCalendarView } from './calendar/calendarView.js';

// A calendar on the canvas. It always shows the month, keeps each person's
// own events (useCalendarEvents) and adds Google Calendar once it is connected.
export function CalendarWindow({ win, onUpdate, onSpawn }) {
  const ownView = React.useMemo(() => loadCalendarView(win.id), [win.id]);

  const [currentDate, setCurrentDate] = React.useState(() => ownView.currentDate || new Date());
  const [viewMode, setViewMode] = React.useState(ownView.viewMode || 'month'); // 'list' | 'month'
  const [selectedDateStr, setSelectedDateStr] = React.useState(ownView.selectedDateStr || null);

  // Composer State
  const [isComposing, setIsComposing] = React.useState(Boolean(ownView.isComposing));
  const [composeDay, setComposeDay] = React.useState(null);
  const calendar = useCalendarEvents(currentDate, viewMode);
  const { events } = calendar;

  // Each person's view stays in their own browser, never in the board's
  // shared window (calendarView.js).
  React.useEffect(() => {
    saveCalendarView(win.id, { viewMode, currentDate: currentDate.toISOString(), selectedDateStr, isComposing });
  }, [win.id, viewMode, currentDate, selectedDateStr, isComposing]);

  // A view an older copy saved into the shared window is set aside once.
  const hasSharedView = Boolean(win.data?.calendar);
  React.useEffect(() => {
    if (!hasSharedView) return;
    const { calendar: _setAside, ...rest } = win.data || {};
    logCalendarViewSetAside();
    onUpdate?.({ data: rest });
  }, [hasSharedView]);

  // Handle pre-fill from win.data
  React.useEffect(() => {
    if (win.data?.prefill) {
      setIsComposing(true);
    }
  }, [win.data]);

  const compose = (day) => {
    setSelectedDateStr(null);
    setComposeDay(day);
    setIsComposing(true);
  };

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
        subtitle={calendar.googleStatus === 'connected' ? 'yours + Google' : undefined}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      >
        <CalendarToolbar viewMode={viewMode} setViewMode={setViewMode} currentDate={currentDate} setCurrentDate={setCurrentDate} />

      </WindowTitle>

      <div className="hb-cal" aria-busy={calendar.loading ? 'true' : undefined}>

        {/* The picked day: its events, Delete for your own, and Add event on this day */}
        {selectedDateStr && (
          <CalendarDateModal
            selectedDateStr={selectedDateStr}
            groupedEvents={groupedEvents}
            onClose={() => setSelectedDateStr(null)}
            onSpawn={onSpawn}
            onAddOnDay={compose}
            onDelete={calendar.remove}
          />
        )}

        <CalendarWeekHeader weekDays={weekDays} viewMode={viewMode} isToday={isToday} />

        <div className="hb-cal-body">
          {viewMode === 'month' ? (
            <CalendarMonthView monthDays={monthDays} groupedEvents={groupedEvents} isToday={isToday} onSelectDate={setSelectedDateStr} />
          ) : events.length > 0 ? (
            <CalendarListView groupedEvents={groupedEvents} onSpawn={onSpawn} />
          ) : (
            <p className="hb-cal-empty">{calendar.loading ? 'Loading events...' : 'Nothing on this week yet.'}</p>
          )}
        </div>

        {isComposing ? (
          <CalendarEventComposer
            onAdd={calendar.add}
            onClose={() => { setIsComposing(false); setComposeDay(null); }}
            prefillData={win.data?.prefill}
            onClearPrefill={() => onUpdate({ data: { ...win.data, prefill: null } })}
            googleStatus={calendar.googleStatus}
            initialDate={composeDay}
            covered={Boolean(selectedDateStr)}
          />
        ) : (
          <CalendarFooter googleStatus={calendar.googleStatus} ownProblem={calendar.ownProblem} onAdd={() => compose(null)} onRetry={calendar.reload} />
        )}

      </div>
    </>
  );
}
