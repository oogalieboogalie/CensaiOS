/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { api } from '../../../lib/api.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { classLinkUrl, studentBoardUrl } from '../../../lib/workspace/shareLink.js';
import { windowMeta } from './meta.js';
import { CreateClassForm } from './CreateClassForm.jsx';
import { StudentTile } from './StudentTile.jsx';
import { readClassTokens, saveClassTokens } from './classTokens.js';
import { useClassroom } from './useClassroom.js';

export { windowMeta };

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function HelpQueue({ queue, onLower }) {
  if (!queue.length) return null;
  return (
    <div className="hb-class-queue" data-testid="class-help-queue">
      <span className="hb-class-label">Help queue</span>
      {queue.map((item, index) => (
        <span key={item.enrollmentId} className="hb-class-queue-item">
          {index + 1}. {item.name}
          <button type="button" className="hb-btn" onClick={() => onLower(item.enrollmentId)}>Done</button>
        </span>
      ))}
    </div>
  );
}

function Codes({ klass, tokens, onAdd }) {
  if (klass.gate !== 'invite') {
    return <p className="hb-class-note">Paid members join with the class link and a Stripe subscription. Seats end when a subscription does.</p>;
  }
  return (
    <div className="hb-class-field">
      <span className="hb-class-label">Invite codes, one per student</span>
      {tokens.codes.length
        ? <div className="hb-class-codes" data-testid="class-codes">{tokens.codes.map((code) => <span key={code} className="hb-class-code">{code}</span>)}</div>
        : <p className="hb-class-note">Codes were made in another browser. Add new ones here.</p>}
      <div><button type="button" className="hb-btn" onClick={onAdd}>Add a code</button></div>
    </div>
  );
}

/**
 * The instructor's classroom (spec 12): start a class from this board, then
 * watch every student's copy at once, follow anyone, answer raised hands and
 * stamp each step when it looks good.
 */
export function ClassroomWindow({ win = {} }) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const room = useClassroom(workspaceId);
  const { active, roster } = room;
  const [tokens, setTokens] = React.useState({ token: null, codes: [] });
  const [showCodes, setShowCodes] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  React.useEffect(() => { if (active) setTokens(readClassTokens(active.id)); }, [active]);

  const link = tokens.token ? classLinkUrl(tokens.token) : '';
  const students = roster?.students || [];
  const seated = students.filter((student) => student.status === 'active').length;
  const flash = (text) => { setNotice(text); setTimeout(() => setNotice(''), 2000); };

  const act = (fn) => async (...args) => {
    try { await fn(...args); await room.reloadRoster(); } catch (error) { room.setError(error.message); }
  };
  const review = act((student, stepId, body) => api.reviewCheckpoint(active.id, student.id, stepId, body));
  const lower = act((enrollmentId) => api.lowerStudentHand(active.id, enrollmentId));
  const remove = act(async (student) => {
    if (window.confirm(`Remove ${student.name} from the class? Their board stays with you.`)) await api.removeStudent(active.id, student.id);
  });
  const addCode = act(async () => {
    const result = await api.createClassInviteCodes(active.id, 1);
    saveClassTokens(active.id, { codes: result.codes });
    setTokens(readClassTokens(active.id));
  });
  const end = async () => {
    if (!window.confirm('End the class? Students lose access; their boards stay with you.')) return;
    await api.endClass(active.id).catch((error) => room.setError(error.message));
    await room.reloadClasses();
  };

  const actions = active ? [
    { id: 'link', label: 'Copy class link', icon: <Icon.Copy size={14} />,
      onSelect: async () => flash(!link ? 'The link is in the browser that started the class' : (await copy(link)) ? 'Class link copied' : link) },
    { id: 'codes', label: 'Codes', pressed: showCodes, onSelect: () => setShowCodes((value) => !value) },
  ] : [];

  return (
    <>
      <WindowTitle
        icon={<Icon.Classroom size={14} />}
        label={win.title || windowMeta.label}
        subtitle={active ? `${active.title} · ${seated}/${active.seatLimit} seats` : 'Teach a live class'}
        actions={actions}
        menu={active ? [{ id: 'end', label: 'End class', onSelect: end }] : undefined}
      />
      <div className="hb-class" data-testid="classroom">
        {active && (
          <div className="hb-class-head">
            <span className="hb-class-title">{active.title}</span>
            <span className="hb-class-meta">{seated} of {active.seatLimit} seats · {active.checkpoints.length} steps</span>
            <span className="hb-class-spacer" />
            {notice && <span className="hb-class-meta" role="status">{notice}</span>}
            {link && <input className="hb-class-input" readOnly value={link} data-testid="class-link" style={{ maxWidth: 260 }} onFocus={(event) => event.target.select()} />}
          </div>
        )}
        <div className="hb-class-scroll">
          {room.error && <div role="alert" className="hb-class-error">{room.error}</div>}
          {room.classes === null && <p className="hb-class-note">Loading…</p>}
          {room.classes !== null && !active && !room.canTeach && (
            <p className="hb-class-note" data-testid="classroom-members-note">Only the board owner or an admin can run a class from this window.</p>
          )}
          {room.classes !== null && !active && room.canTeach && (
            <CreateClassForm workspaceId={workspaceId} stripe={room.stripe} onCreated={async () => { setShowCodes(true); await room.reloadClasses(); }} />
          )}
          {active && (
            <>
              {showCodes && <Codes klass={active} tokens={tokens} onAdd={addCode} />}
              <HelpQueue queue={roster?.helpQueue || []} onLower={lower} />
              {!students.length && <p className="hb-class-note">No one has joined yet. Send the class link{active.gate === 'invite' ? ' and one invite code to each student' : ''}.</p>}
              <div className="hb-class-grid" data-testid="class-grid">
                {students.slice(0, 16).map((student) => (
                  <StudentTile key={student.id} student={student}
                    onOpen={() => student.boardWorkspaceId && window.open(studentBoardUrl(student.boardWorkspaceId, student.guestId), '_blank', 'noopener')}
                    onReview={(stepId, body) => review(student, stepId, body)}
                    onLowerHand={() => lower(student.id)}
                    onRemove={() => remove(student)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
