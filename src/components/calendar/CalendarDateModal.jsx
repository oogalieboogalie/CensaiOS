import React from 'react';

import { HBLinkButton } from './CalendarListView.jsx';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

export function CalendarDateModal({ selectedDateStr, groupedEvents, onClose, onSpawn }) {
  useEscapeDismiss(true, onClose);
  return (
    <div
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={onClose}
          >
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, width: '100%', maxWidth: 300, boxShadow: 'var(--shadow-window)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{new Date(selectedDateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
                <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)' }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {(groupedEvents.find(g => g[0] === selectedDateStr)?.[1] || []).length === 0 ? (
                  <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>No events scheduled.</span>
                ) : (
                  (groupedEvents.find(g => g[0] === selectedDateStr)?.[1] || []).map(ev => (
                    <div key={ev.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: ev.color, marginTop: 6 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <a href={ev.link} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none' }}>{ev.title}</a>
                        <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{ev.time}</span>
                        <HBLinkButton desc={ev.description} onSpawn={onSpawn} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

  );
}
