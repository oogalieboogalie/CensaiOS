import React from 'react';
import { api } from '../../lib/api.js';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

export function CalendarEventComposer({ onSuccess, onClose, prefillData, onClearPrefill }) {
  useEscapeDismiss(true, onClose);

  const [composingTitle, setComposingTitle] = React.useState('');
  const [composingDate, setComposingDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [composingStartTime, setComposingStartTime] = React.useState('09:00');
  const [composingEndTime, setComposingEndTime] = React.useState('10:00');
  const [composingDescription, setComposingDescription] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (prefillData) {
      if (prefillData.title) setComposingTitle(prefillData.title);
      if (prefillData.date) setComposingDate(prefillData.date);
      if (prefillData.startTime) setComposingStartTime(prefillData.startTime);
      if (prefillData.endTime) setComposingEndTime(prefillData.endTime);
      if (prefillData.description) setComposingDescription(prefillData.description);
      onClearPrefill();
    }
  }, [prefillData, onClearPrefill]);


const handleSubmit = async (e) => {
    e.preventDefault();
    if (!composingTitle || submitting) return;

    setSubmitting(true);
    try {
      const start = new Date(`${composingDate}T${composingStartTime}:00`);
      const end = new Date(`${composingDate}T${composingEndTime}:00`);

      await api.addCalendarEvent({
        title: composingTitle,
        start: start.toISOString(),
        end: end.toISOString(),
        description: composingDescription
      });

      setComposingTitle('');
      setComposingDescription('');
      onClose();
      onSuccess();
    } catch (err) {
      alert(`Failed to add event: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'absolute', bottom: 60, left: 12, right: 12, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 12, boxShadow: 'var(--shadow-pop)', zIndex: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>New Event</span>
              <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                autoFocus
                type="text"
                placeholder="Event Title"
                value={composingTitle}
                onChange={e => setComposingTitle(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface-2)', fontSize: 13, outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="date"
                  value={composingDate}
                  onChange={e => setComposingDate(e.target.value)}
                  style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface-2)', fontSize: 11, outline: 'none' }}
                />
                <input
                  type="time"
                  value={composingStartTime}
                  onChange={e => setComposingStartTime(e.target.value)}
                  style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface-2)', fontSize: 11, outline: 'none' }}
                />
                <span style={{ alignSelf: 'center', fontSize: 11 }}>–</span>
                <input
                  type="time"
                  value={composingEndTime}
                  onChange={e => setComposingEndTime(e.target.value)}
                  style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface-2)', fontSize: 11, outline: 'none' }}
                />
              </div>
              <textarea
                placeholder="Description / Context Link"
                value={composingDescription}
                onChange={e => setComposingDescription(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface-2)', fontSize: 12, outline: 'none', resize: 'none' }}
              />
              <button
                type="submit"
                disabled={!composingTitle || submitting}
                style={{ width: '100%', padding: '8px', borderRadius: 8, background: 'var(--ps-blue)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: (!composingTitle || submitting) ? 0.6 : 1 }}
              >
                {submitting ? 'Adding...' : 'Create Google Calendar Event'}
              </button>
            </form>
          </div>
  );
}
