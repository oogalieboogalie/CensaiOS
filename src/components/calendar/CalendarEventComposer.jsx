import React from 'react';
import { api } from '../../lib/api.js';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';
import { TimePicker } from '../schedule/TimePicker.jsx';
import { clockWords, localDay, whenWords } from '../../lib/schedule/plainWords.js';

export function CalendarEventComposer({ onSuccess, onClose, prefillData, onClearPrefill }) {
  useEscapeDismiss(true, onClose);

  const [composingTitle, setComposingTitle] = React.useState('');
  const [composingDate, setComposingDate] = React.useState(localDay());
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
    <div className="hb-sched-composer">
      <div className="hb-sched-pane-head">
        <h3 className="hb-sched-pane-title">New event</h3>
        <button type="button" className="hb-sched-btn" aria-label="Close" onClick={onClose}>Close</button>
      </div>
      <form onSubmit={handleSubmit} className="hb-sched-pane-body">
        <input
          autoFocus
          className="hb-sched-input"
          type="text"
          placeholder="What is it?"
          aria-label="Event title"
          value={composingTitle}
          onChange={e => setComposingTitle(e.target.value)}
        />
        <label className="hb-sched-field">
          <span className="hb-sched-label">Day</span>
          <input className="hb-sched-input" type="date" value={composingDate} onChange={e => setComposingDate(e.target.value)} />
        </label>
        <div className="hb-sched-pair">
          <TimePicker label="Starts" value={composingStartTime} onChange={setComposingStartTime} quick={false} />
          <TimePicker label="Ends" value={composingEndTime} onChange={setComposingEndTime} quick={false} />
        </div>
        <p className="hb-sched-sentence">{whenWords(new Date(`${composingDate}T${composingStartTime}:00`))} to {clockWords(composingEndTime)}</p>
        <textarea
          className="hb-sched-input"
          placeholder="Notes or a link (optional)"
          aria-label="Notes"
          value={composingDescription}
          onChange={e => setComposingDescription(e.target.value)}
          rows={2}
        />
        <button type="submit" className="hb-sched-btn" data-primary="true" disabled={!composingTitle || submitting}>
          {submitting ? 'Adding...' : 'Add to Google Calendar'}
        </button>
      </form>
    </div>
  );
}
