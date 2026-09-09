import React from 'react';

export const parseHBLink = (desc) => {
    if (!desc) return null;
    const taskMatch = desc.match(/hb:\/\/task\/([a-zA-Z0-9-]+)/);
    if (taskMatch) return { type: 'task', id: taskMatch[1] };
    const docMatch = desc.match(/hb:\/\/doc\/([^\s]+)/);
    if (docMatch) return { type: 'doc', fileName: docMatch[1] };
    return null;
};

export const HBLinkButton = ({ desc, onSpawn }) => {
    const link = parseHBLink(desc);
    if (!link) return null;

    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (link.type === 'task') {
            onSpawn('todos', { title: 'Linked Task', taskId: link.id });
          } else if (link.type === 'doc') {
            onSpawn('doc', { fileName: link.fileName, maximized: true });
          }
        }}
        style={{
          all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          marginTop: 4, padding: '2px 8px', borderRadius: 4, background: 'var(--accent-soft)',
          color: 'var(--accent-ink)', fontSize: 10, fontWeight: 700, border: '1px solid var(--accent)'
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        Open {link.type === 'task' ? 'Task' : 'Doc'}
      </button>
    );
};

export function CalendarListView({ groupedEvents, onSpawn }) {
  return (
    <>
      {groupedEvents.map(([date, dayEvents]) => (
        <div key={date} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>
            {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}
          </span>
          {dayEvents.map(ev => (
            <div key={ev.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: ev.color, marginTop: 6 }} />
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <a href={ev.link} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none' }}>{ev.title}</a>
                <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{ev.time}</span>
                <HBLinkButton desc={ev.description} onSpawn={onSpawn} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
