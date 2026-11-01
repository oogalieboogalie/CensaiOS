import React from 'react';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';
import { TimePicker } from '../schedule/TimePicker.jsx';
import { clockWords, localDay, whenWords } from '../../lib/schedule/plainWords.js';

const TARGETS = [['own', 'My calendar'], ['google', 'Google Calendar']];

/** What is wrong with the picked day and times, in plain words; null when they work. */
export function timeProblem(start, end) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Pick a day.';
  if (end <= start) return 'It ends before it starts. Pick a later end time.';
  return null;
}

// A new event goes on this person's own calendar. Once Google Calendar is
// connected they can pick it instead (it stays the first pick, as before),
// also when Google did not answer just now. While the window is still asking
// Google, Add waits. An open day on top (`covered`) takes Escape first.
export function CalendarEventComposer({ onAdd, onClose, prefillData, onClearPrefill, googleStatus = 'not-connected', initialDate = null, covered = false }) {
  useEscapeDismiss(!covered, onClose);

  const [composingTitle, setComposingTitle] = React.useState('');
  const [composingDate, setComposingDate] = React.useState(() => initialDate || localDay());
  const [composingStartTime, setComposingStartTime] = React.useState('09:00');
  const [composingEndTime, setComposingEndTime] = React.useState('10:00');
  const [composingDescription, setComposingDescription] = React.useState('');
  const [picked, setPicked] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [problem, setProblem] = React.useState(null);
  const googleToo = googleStatus === 'connected' || googleStatus === 'failed';
  const checking = googleStatus === 'loading';
  const target = googleToo ? picked || 'google' : 'own';

  // "Add event on this day" while the form is already open moves it to that
  // day and puts the keyboard back on its name.
  const titleInput = React.useRef(null);
  React.useEffect(() => {
    if (!initialDate) return;
    setComposingDate(initialDate);
    titleInput.current?.focus();
  }, [initialDate]);

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

  const start = new Date(`${composingDate}T${composingStartTime}:00`);
  const end = new Date(`${composingDate}T${composingEndTime}:00`);
  const timesWrong = timeProblem(start, end);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!composingTitle.trim() || submitting || timesWrong || checking) return;
    setSubmitting(true);
    setProblem(null);
    try {
      await onAdd({
        title: composingTitle.trim(),
        start: start.toISOString(),
        end: end.toISOString(),
        description: composingDescription,
      }, target);
      onClose();
    } catch (err) {
      setProblem(err.message || 'The event could not be added.');
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
          ref={titleInput}
          autoFocus
          className="hb-sched-input"
          type="text"
          placeholder="What is it?"
          aria-label="Event title"
          maxLength={200}
          value={composingTitle}
          onChange={e => setComposingTitle(e.target.value)}
        />
        <label className="hb-sched-field">
          <span className="hb-sched-label">Day</span>
          <input className="hb-sched-input" type="date" aria-label="Day" value={composingDate} onChange={e => setComposingDate(e.target.value)} />
        </label>
        <div className="hb-sched-pair">
          <TimePicker label="Starts" value={composingStartTime} onChange={setComposingStartTime} quick={false} />
          <TimePicker label="Ends" value={composingEndTime} onChange={setComposingEndTime} quick={false} />
        </div>
        {timesWrong
          ? <p className="hb-cal-problem" role="alert">{timesWrong}</p>
          : <p className="hb-sched-sentence">{whenWords(start)} to {clockWords(composingEndTime)}</p>}
        <textarea
          className="hb-sched-input"
          placeholder="Notes or a link (optional)"
          aria-label="Notes"
          maxLength={2000}
          value={composingDescription}
          onChange={e => setComposingDescription(e.target.value)}
          rows={2}
        />
        {googleToo && (
          <div className="hb-sched-field">
            <span className="hb-sched-label">Add to</span>
            <div className="hb-sched-seg" role="group" aria-label="Add to">
              {TARGETS.map(([id, words]) => (
                <button key={id} type="button" aria-pressed={target === id} onClick={() => setPicked(id)}>{words}</button>
              ))}
            </div>
          </div>
        )}
        {problem && <p className="hb-cal-problem" role="alert">{problem}</p>}
        <button type="submit" className="hb-sched-btn" data-primary="true" disabled={!composingTitle.trim() || submitting || checking || Boolean(timesWrong)}>
          {submitting ? 'Adding...' : checking ? 'Checking your calendars...' : target === 'google' ? 'Add to Google Calendar' : 'Add to my calendar'}
        </button>
      </form>
    </div>
  );
}
