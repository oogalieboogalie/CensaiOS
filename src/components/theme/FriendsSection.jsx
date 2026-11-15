import React from 'react';
import { ThemePanelCard } from './ThemeControls.jsx';
import { useWorkspaceStore } from '../../lib/store.js';
import { CodeBox, Hint } from './friends/CodeBox.jsx';
import { FriendRows, JoinedBoards } from './friends/FriendRows.jsx';
import {
  addFriend, copyText, getFriends, joinBoard, kindOfCode, leaveBoard, mayNotOpenFriendBoards, openBoard, removeFriend, saveFriends,
  shareWithFriend, stopSharing,
} from '../../lib/friends/index.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const heading = { fontWeight: 650, color: 'var(--ink)', fontSize: 'var(--text-sm)' };
const button = { border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '7px 12px', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer', flexShrink: 0 };
const field = { flex: 1, minWidth: 0, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '7px 10px', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 'var(--text-sm)' };

function GetTailcat({ install, busy, onCheck }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div style={{ display: 'grid', gap: 8 }} data-testid="friends-needs-tailcat">
      <p style={muted}>
        Friends connects two computers directly with tailcat, a free tool from the people who make Tailscale.
        It is not on this computer yet. {install?.how || 'In a terminal'}, run this once:
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <code style={{ ...field, fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{install?.line}</code>
        <button type="button" style={button} onClick={async () => setCopied(await copyText(install?.line || ''))}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div><button type="button" style={button} disabled={busy} onClick={onCheck}>I've done that, check again</button></div>
    </div>
  );
}

/**
 * Friends (Settings, Sharing): this computer's friend code, the friends
 * list, sharing the open board with one friend, and joining a friend's.
 * Only friends can join, and each party code works on one friend's computer.
 */
export function FriendsSection() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [card, setCard] = React.useState(null);
  const [note, setNote] = React.useState({ text: '', tone: '' });
  const [busy, setBusy] = React.useState(false);
  const [pasted, setPasted] = React.useState('');

  React.useEffect(() => {
    let live = true;
    getFriends()
      .then((data) => { if (live) setCard(data); })
      .catch(() => { /* no answer: the card stays hidden */ });
    return () => { live = false; };
  }, []);

  // While a board is shared or joined, look again now and then: the card
  // says when the friend has come in, and when a board they shared has closed.
  const active = Boolean(card?.on && ((card.friends || []).some((friend) => friend.party) || (card.joins || []).length));
  const busyNow = React.useRef(false);
  busyNow.current = busy;
  React.useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => {
      if (busyNow.current) return;
      getFriends().then((data) => { if (!busyNow.current) setCard(data); }).catch(() => {});
    }, 6000);
    return () => clearInterval(timer);
  }, [active]);

  /** Runs one change, shows the card it answers with, and says what happened. */
  async function run(change, done) {
    setNote({ text: '', tone: '' });
    setBusy(true);
    try {
      const next = await change();
      setCard(next);
      if (done) setNote({ text: done(next), tone: 'good' });
      return next;
    } catch (error) {
      setNote({ text: error.message, tone: 'bad' });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function usePasted(event) {
    event.preventDefault();
    const code = pasted.trim();
    const kind = kindOfCode(code);
    if (!kind) {
      setNote({ text: 'That is not a friend code or a party code. Copy the whole code and paste it again.', tone: 'bad' });
      return;
    }
    const next = kind === 'friend'
      ? await run(() => addFriend(code), (data) => (data.added?.alreadyThere ? `${data.added.name} is already your friend.` : `${data.added?.name} is on your list. You can share a board with them now. They add your friend code the same way.`))
      : await run(() => joinBoard(code), (data) => `Connected to ${data.joined?.hostName}'s board "${data.joined?.boardName}". ${data.opened ? 'It is opening in your browser.' : 'Press Open below to go there.'}`);
    if (next) setPasted('');
  }

  async function open(join) {
    const opened = await openBoard(join.url);
    if (!opened) setNote({ text: 'Your browser stopped the new tab. Allow pop-ups for censaiOS, then press Open again.', tone: 'bad' });
  }

  function remove(friend) {
    const sure = globalThis.confirm?.(`Remove ${friend.name}? They are taken off every board you shared with them, right away.`);
    if (sure) run(() => removeFriend(friend.id), () => `${friend.name} is removed.`);
  }

  if (!card || card.usable !== true) return null;

  return (
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 14, marginTop: 12 }} data-testid="friends-section">
      <div>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 750, color: 'var(--ink)' }}>Friends</div>
        <p style={{ ...muted, marginTop: 3 }}>
          Share a board with a friend who is anywhere, computer to computer. Only people on your list can join,
          and only when you share a board with them. They come in as themselves, never as you.
        </p>
      </div>
      {note.text ? <div role={note.tone === 'bad' ? 'alert' : 'status'}><Hint tone={note.tone}>{note.text}</Hint></div> : null}
      {!card.tailcat ? (
        <GetTailcat install={card.install} busy={busy} onCheck={() => run(getFriends)} />
      ) : (
        <>
          <div style={{ display: 'grid', gap: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: busy ? 'default' : 'pointer', fontWeight: 650, color: 'var(--ink)' }}>
              <input type="checkbox" role="switch" checked={card.on} disabled={busy} onChange={(event) => run(() => saveFriends({ on: event.target.checked }))} />
              Let friends join boards I share
            </label>
            <p style={muted}>{card.on ? 'On. Nobody joins anything until you share a board with them.' : 'Off. Nobody can join, and you have no friend code.'}</p>
          </div>
          {card.on && (
            <>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={heading}>Your friend code</div>
                <CodeBox code={card.code} label="Your friend code" testId="friend-code" />
                <p style={muted}>
                  Send it to a friend any way you like. It says who you are ({card.name}) and nothing else: holding it lets nobody in.
                </p>
              </div>
              <form onSubmit={usePasted} style={{ display: 'grid', gap: 6 }}>
                <label htmlFor="friends-paste" style={heading}>Paste a code</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="friends-paste" style={field} value={pasted} disabled={busy} autoComplete="off" spellCheck={false}
                    placeholder="A friend code, or a party code a friend sent you" onChange={(event) => setPasted(event.target.value)} />
                  <button type="submit" style={button} disabled={busy || !pasted.trim()}>
                    {kindOfCode(pasted) === 'party' ? 'Join' : 'Add'}
                  </button>
                </div>
                <p style={muted}>A friend code adds that person to your list. A party code opens the board they are sharing with you.</p>
              </form>
              <JoinedBoards joins={card.joins || []} busy={busy} safari={mayNotOpenFriendBoards()} onOpen={open} onLeave={(join) => run(() => leaveBoard(join.id), () => `You left ${join.hostName}'s board.`)} />
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={heading}>Your friends</div>
                <FriendRows
                  friends={card.friends || []}
                  busy={busy}
                  boardId={workspaceId}
                  onShare={(friend, role) => run(() => shareWithFriend(friend.id, { workspaceId, role }))}
                  onStop={(party) => run(() => stopSharing(party.id), () => `Stopped sharing with ${party.friendName}. They are off the board and the code no longer works.`)}
                  onRemove={remove}
                />
              </div>
            </>
          )}
        </>
      )}
    </ThemePanelCard>
  );
}
