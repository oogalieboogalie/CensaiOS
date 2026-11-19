import React from 'react';
import { CodeBox, Hint } from './CodeBox.jsx';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const heading = { fontWeight: 650, color: 'var(--ink)', fontSize: 'var(--text-sm)' };
const button = { border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '7px 12px', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const quiet = { ...button, background: 'transparent', color: 'var(--ink-soft)', fontWeight: 600 };
const ROLES = [['member', 'Can edit'], ['viewer', 'Can look']];

/** "1234 5678": easier to read out loud than eight digits in a row. */
export const spokenDigits = (code) => `${String(code).slice(0, 4)} ${String(code).slice(4)}`;

/** Counts the open door down on this screen, between the looks at the server. */
function useSecondsLeft(quick) {
  const [left, setLeft] = React.useState(quick?.secondsLeft || 0);
  React.useEffect(() => {
    setLeft(quick?.secondsLeft || 0);
    if (!quick?.secondsLeft) return undefined;
    const timer = setInterval(() => setLeft((now) => Math.max(0, now - 1)), 1000);
    return () => clearInterval(timer);
  }, [quick?.secondsLeft, quick?.invite]);
  return left;
}

/**
 * Letting in someone who is not on the friends list yet: an invite to send,
 * 8 digits to tell them, and a door the owner opens for 30 seconds.
 */
export function QuickInvite({ quick, guest, busy, canShare, onMake, onOpen, onEnd }) {
  const [role, setRole] = React.useState('member');
  const left = useSecondsLeft(quick);

  if (!quick) {
    return (
      <div style={{ display: 'grid', gap: 6 }} data-testid="quick-invite">
        <div style={heading}>Invite someone new</div>
        {guest ? <Hint tone="good">{guest.name} came in on your invite and is on your friends list now.</Hint> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select aria-label="What the person you invite can do on this board" value={role} disabled={busy} onChange={(event) => setRole(event.target.value)} style={{ ...quiet, padding: '6px 8px' }}>
            {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="button" style={button} disabled={busy || !canShare} onClick={() => onMake(role)}>Make a quick invite</button>
        </div>
        <p style={muted}>
          For someone who is not on your list yet. You get an invite to send and 8 digits to tell them. They come in
          on this board while you hold the door open, and go on your friends list. No swapping friend codes first.
        </p>
      </div>
    );
  }

  const open = quick.open && left > 0;
  return (
    <div style={{ display: 'grid', gap: 8 }} data-testid="quick-invite" data-door={open ? 'open' : 'shut'}>
      <div style={heading}>Quick invite to "{quick.boardName}" ({quick.role === 'viewer' ? 'can look' : 'can edit'})</div>
      <p style={muted}>1. Send this invite to the person, any way you like.</p>
      <CodeBox code={quick.invite} label="Quick invite" testId="quick-invite-code" />
      <p style={muted}>2. Tell them these 8 digits. Say them or send them apart from the invite.</p>
      <div data-testid="door-code" aria-label="The 8 digits"
        style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-2xl)', fontWeight: 750, letterSpacing: '0.12em', color: 'var(--ink)' }}>
        {spokenDigits(quick.doorCode)}
      </div>
      <p style={muted}>3. When they are ready to type the digits, open the door. It stays open for 30 seconds.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={button} disabled={busy} onClick={onOpen}>{open ? 'Give them 30 more seconds' : 'Open the door for 30 seconds'}</button>
        <button type="button" style={quiet} disabled={busy} onClick={onEnd}>End this invite</button>
        <span role="status" data-testid="door-state" style={{ ...muted, color: open ? 'var(--success)' : muted.color, fontWeight: 650 }}>
          {open ? `The door is open: ${left} second${left === 1 ? '' : 's'} left.` : 'The door is shut. Nobody can come in.'}
        </span>
      </div>
      <p style={muted}>
        One person can use this invite. It ends once they are in, after {quick.triesLeft} wrong {quick.triesLeft === 1 ? 'try' : 'tries'},
        or in 10 minutes. While the door is shut, the digits do nothing.
      </p>
    </div>
  );
}

/** The other side: the 8 digits for a quick invite that was pasted. */
export function DoorCodeField({ value, disabled, onChange }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <label htmlFor="friends-door-code" style={heading}>The 8 digits they told you</label>
      <input id="friends-door-code" inputMode="numeric" autoComplete="off" maxLength={9} value={value} disabled={disabled}
        placeholder="1234 5678" onChange={(event) => onChange(event.target.value.replace(/[^\d ]/g, ''))}
        style={{ width: 150, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '7px 10px', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-md)', letterSpacing: '0.08em' }} />
      <p style={muted}>Ask them to open the door, then press Come in. The door is only open for 30 seconds at a time.</p>
    </div>
  );
}
