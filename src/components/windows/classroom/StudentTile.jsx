/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';

const PAD = 40;

/** Fit a board's window boxes (and the student's cursor) into a tile. */
export function thumbnailFrame(boxes = [], cursors = []) {
  const points = [
    ...boxes.flatMap((box) => [[box.x, box.y], [box.x + box.w, box.y + box.h]]),
    ...cursors.map((cursor) => [cursor.x, cursor.y]),
  ];
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  return { x: minX, y: minY, w: Math.max(...xs) + PAD - minX, h: Math.max(...ys) + PAD - minY };
}

function Thumbnail({ student, onOpen }) {
  const frame = thumbnailFrame(student.thumbnail, student.cursors);
  const stroke = frame ? frame.w / 220 : 1;
  return (
    <button type="button" className="hb-class-thumb" onClick={onOpen} data-testid="class-tile-open"
      title={`Open ${student.name}'s board and follow their view`}>
      {frame ? (
        <svg viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {student.thumbnail.map((box) => (
            <rect key={box.id} className="hb-class-thumb-win" x={box.x} y={box.y} width={box.w} height={box.h}
              rx={stroke * 4} strokeWidth={stroke} />
          ))}
          {student.cursors.map((cursor) => (
            <circle key={cursor.id} cx={cursor.x} cy={cursor.y} r={stroke * 5}
              style={{ fill: cursor.color || 'var(--accent)' }} />
          ))}
        </svg>
      ) : <span className="hb-class-thumb-empty">{student.status === 'active' ? 'Empty board' : 'Not here'}</span>}
    </button>
  );
}

function stepState(step) {
  if (step.approved) return 'approved';
  return step.done ? 'done' : 'todo';
}

/**
 * One student in the classroom grid: their board in miniature with their
 * cursor, progress, a raised hand, and a chip per step. A ticked step's chip
 * stamps it "looks good"; an approved chip takes the stamp back.
 */
export function StudentTile({ student, onOpen, onReview, onLowerHand, onRemove }) {
  const [noting, setNoting] = React.useState(null);
  const [note, setNote] = React.useState('');
  const { progress } = student;
  const sendNote = async (event) => {
    event.preventDefault();
    if (!note.trim()) return;
    await onReview(noting, { note: note.trim() });
    setNote('');
    setNoting(null);
  };
  return (
    <div className="hb-class-tile" data-testid="class-tile" data-student={student.name} data-hand={student.handRaisedAt ? 'true' : undefined}>
      <Thumbnail student={student} onOpen={onOpen} />
      <div className="hb-class-tile-body">
        <div className="hb-class-tile-name">
          <span className="hb-class-dot" style={student.color ? { background: student.color } : undefined} aria-hidden="true" />
          <span>{student.name}</span>
          {student.status !== 'active' && <span className="hb-class-meta">{student.status === 'pending' ? 'paying' : 'left'}</span>}
          {student.handRaisedAt && (
            <span className="hb-class-hand" title="Hand raised"><Icon.Hand size={13} />Hand</span>
          )}
        </div>
        <div className="hb-class-bar" title={`${progress.done} of ${progress.total} done, ${progress.approved} approved`}>
          <span style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
        </div>
        <div className="hb-class-steps">
          {progress.steps.map((step, index) => {
            const state = stepState(step);
            return (
              <button key={step.id} type="button" className="hb-class-step" data-state={state} data-testid={`class-step-${index + 1}`}
                disabled={state === 'todo'}
                title={state === 'done' ? `Stamp "${step.title}" looks good` : state === 'approved' ? `Approved by ${step.approvedBy}. Click to take it back` : `${step.title}: not done yet`}
                onClick={() => onReview(step.id, { approved: state !== 'approved' })}>
                {state === 'approved' ? <Icon.Check size={11} /> : <span aria-hidden="true">{index + 1}</span>}
                <span>{state === 'approved' ? 'Looks good' : step.title}</span>
              </button>
            );
          })}
        </div>
        {noting ? (
          <form onSubmit={sendNote} className="hb-class-tile-actions">
            <input className="hb-class-input" autoFocus value={note} maxLength={500} placeholder="Note on their board"
              onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setNoting(null); }} />
            <button type="submit" className="hb-btn" data-primary="true">Pin</button>
          </form>
        ) : (
          <div className="hb-class-tile-actions">
            <button type="button" className="hb-btn" onClick={onOpen}>Follow</button>
            <button type="button" className="hb-btn" disabled={!progress.steps.length || student.status !== 'active'}
              onClick={() => setNoting((progress.steps.find((step) => step.done && !step.approved) || progress.steps[0]).id)}>Note</button>
            {student.handRaisedAt && <button type="button" className="hb-btn" onClick={onLowerHand}>Lower</button>}
            <span className="hb-class-spacer" />
            <button type="button" className="hb-btn" title="Remove from class" onClick={onRemove}>Remove</button>
          </div>
        )}
      </div>
    </div>
  );
}
