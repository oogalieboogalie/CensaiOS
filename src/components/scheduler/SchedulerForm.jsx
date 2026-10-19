import React from 'react';
import { SchedulerAgentSelect } from './SchedulerAgentSelect.jsx';
import { SchedulerProjectOptions } from './SchedulerProjectOptions.jsx';
import { SchedulerTodoPicker } from './SchedulerTodoPicker.jsx';
import { SchedulerTagPicker } from './SchedulerTagPicker.jsx';
import { TimePicker } from '../schedule/TimePicker.jsx';
import { RepeatPicker } from '../schedule/RepeatPicker.jsx';
import { NextRuns } from '../schedule/UpcomingList.jsx';
import { describeSchedule, upcomingRuns } from '../../lib/schedule/plainWords.js';

export function SchedulerForm({ state, onSpawn }) {
  const {
    selectedAgentId, setSelectedAgentId,
    taskText, setTaskText,
    documentTarget, setDocumentTarget,
    tag, setTag,
    when, setWhen,
    schedulesError,
    handleAddSchedule
  } = state;
  const [showMore, setShowMore] = React.useState(Boolean(documentTarget));
  const now = new Date();
  const runs = upcomingRuns(when, now, 3);
  const ready = taskText.trim() && runs.length > 0;

  return (
    <form className="hb-sched-pane" onSubmit={handleAddSchedule}>
      <div className="hb-sched-pane-head">
        <h3 className="hb-sched-pane-title">New run</h3>
      </div>
      <div className="hb-sched-pane-body">
        {schedulesError && <p role="alert" className="hb-sched-error">{schedulesError}</p>}
        <label className="hb-sched-field">
          <span className="hb-sched-label">What to do</span>
          <textarea
            className="hb-sched-input"
            rows={3}
            placeholder="Write the Monday market update for the team"
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
          />
        </label>
        <SchedulerTodoPicker taskText={taskText} setTaskText={setTaskText} onSpawn={onSpawn} />
        <SchedulerTagPicker tag={tag} setTag={setTag} />
        <SchedulerAgentSelect selectedAgentId={selectedAgentId} setSelectedAgentId={setSelectedAgentId} />
        <SchedulerProjectOptions state={state} />
        {showMore ? (
          <label className="hb-sched-field">
            <span className="hb-sched-label">Save the result to (optional)</span>
            <input className="hb-sched-input" type="text" placeholder="market-update.md" value={documentTarget} onChange={(e) => setDocumentTarget(e.target.value)} />
          </label>
        ) : (
          <button type="button" className="hb-sched-more" onClick={() => setShowMore(true)}>Save the result to a document</button>
        )}
        <TimePicker value={when.time} onChange={(time) => setWhen({ ...when, time })} />
        <RepeatPicker value={when} onChange={setWhen} />
        <NextRuns sentence={describeSchedule(when, now)} runs={runs} now={now} />
        <button type="submit" className="hb-sched-btn" data-primary="true" disabled={!ready}>Schedule it</button>
      </div>
    </form>
  );
}
