/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import { mergeCollaborationPreviews } from '../src/app/hooks/useWorkspaceCollaboration.js';
import {
  setLivePresenceSenders,
  resetLivePresenceSenders,
  reportTyping,
  reportTextPreview,
  reportCursor,
} from '../src/lib/collaboration/liveText.js';
import { CanvasCursors } from '../src/components/canvas/CanvasCursors.jsx';
import { PresenceToasts } from '../src/components/PresenceToasts.jsx';
import { createPresenceNotices, LEAVE_GRACE_MS, RECONNECT_MS } from '../src/lib/collaboration/presenceNotices.js';

describe('mergeCollaborationPreviews presence', () => {
  const wins = [
    { id: 'doc-1', kind: 'doc', fileName: 'Notes.md', text: 'local draft' },
    { id: 'chat-1', kind: 'chat' },
  ];

  test('remote text applies to viewers, never the focused editor', () => {
    const presence = {
      text: { 'doc-1': { text: 'remote words', actor: { label: 'Member 8' } } },
      typing: {},
    };
    const viewer = mergeCollaborationPreviews(wins, {}, presence, 'chat-1');
    expect(viewer[0].text).toBe('remote words');
    expect(viewer[0].typingActor.label).toMatch(/typing/);

    const editor = mergeCollaborationPreviews(wins, {}, presence, 'doc-1');
    expect(editor[0].text).toBe('local draft');
    expect(editor[0].typingActor).toBeUndefined();
  });

  test('typing badges attach to any window kind', () => {
    const presence = {
      text: {},
      typing: { 'chat-1': { actor: { label: 'Member 8' } } },
    };
    const merged = mergeCollaborationPreviews(wins, {}, presence, null);
    expect(merged[1].typingActor.label).toBe('Member 8 typing…');
    expect(merged[0].typingActor).toBeUndefined();
  });

  test('previews still move windows', () => {
    const merged = mergeCollaborationPreviews(
      wins, { 'chat-1': { x: 5, y: 6, actor: { label: 'Member 8' } } }, {}, null,
    );
    expect(merged[1].x).toBe(5);
    expect(merged[1].collaborationActor.label).toBe('Member 8');
  });
});

describe('liveText sender registry', () => {
  beforeEach(() => resetLivePresenceSenders());

  test('reports are safe no-ops without senders', () => {
    expect(() => {
      reportCursor(1, 2);
      reportTyping('doc-1');
      reportTextPreview('doc-1', 'hi');
      reportTextPreview(null);
    }).not.toThrow();
  });

  test('reports fan out to wired senders', () => {
    const sendCursor = jest.fn();
    const sendTyping = jest.fn();
    const sendTextPreview = jest.fn();
    setLivePresenceSenders({ sendCursor, sendTyping, sendTextPreview });
    reportCursor(3, 4);
    reportTyping('doc-1');
    reportTextPreview('doc-1', 'hello');
    expect(sendCursor).toHaveBeenCalledWith(3, 4);
    expect(sendTyping).toHaveBeenCalledWith('doc-1');
    expect(sendTextPreview).toHaveBeenCalledWith('doc-1', 'hello');
  });
});

describe('CanvasCursors', () => {
  test('renders labeled remote cursors, skips bad coordinates', () => {
    render(
      <CanvasCursors
        zoom={2}
        cursors={{
          a: { clientId: 'a', x: 10, y: 20, actor: { label: 'Alma' } },
          bad: { clientId: 'bad', x: Infinity, y: 0 },
        }}
      />
    );
    expect(screen.getByText('Alma')).toBeTruthy();
    expect(screen.getAllByTestId('remote-cursor')).toHaveLength(1);
  });

  test('renders nothing without cursors', () => {
    const { container } = render(<CanvasCursors cursors={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// The "joined" and "left" pop-ups count people, not tabs or connections:
// someone seen by both the shared doc and the socket, or in two tabs, is
// announced once; this tab connecting or reconnecting announces nobody; a
// reload, a short drop or a server restart says nothing at all.
describe('presence notices', () => {
  const person = (id, label, clientId = `tab-${id}`, type = 'human') => ({ clientId, actor: { type, id, label } });
  const pat = person('1', 'Pat Example');
  const sam = person('2', 'Sam Example');
  const samSecondTab = person('2', 'Sam Example', 'tab-2b');

  function board() {
    let clock = 1_000;
    const tracker = createPresenceNotices({ now: () => clock });
    tracker.setSelf('1');
    const texts = (notices) => notices.map((n) => n.text);
    return {
      tracker,
      see: (link, list) => texts(tracker.see(link, list)),
      wait: (ms) => { clock += ms; return texts(tracker.due()); },
    };
  }

  test('Sam arriving through both the socket and the shared doc is one "joined"', () => {
    const b = board();
    b.see('socket', [pat]);
    b.see('doc', []);
    expect(b.see('socket', [pat, sam])).toEqual(['Sam Example joined the canvas']);
    expect(b.see('doc', [sam])).toEqual([]);
  });

  test('the same in the other order: the doc first, then the socket', () => {
    const b = board();
    b.see('doc', []);
    b.see('socket', [pat]);
    expect(b.see('doc', [sam])).toEqual(['Sam Example joined the canvas']);
    expect(b.see('socket', [pat, sam])).toEqual([]);
  });

  test('a second tab of Sam is not news, and closing one of the two is not a "left"', () => {
    const b = board();
    b.see('socket', [pat, sam]);
    expect(b.see('socket', [pat, sam, samSecondTab])).toEqual([]);
    expect(b.see('socket', [pat, samSecondTab])).toEqual([]);
    expect(b.wait(LEAVE_GRACE_MS)).toEqual([]);
  });

  test('the people already here when this tab connects are not announced', () => {
    const b = board();
    expect(b.see('socket', [pat, sam])).toEqual([]);
    expect(b.see('doc', [sam])).toEqual([]);
  });

  test('a reload or a short drop says nothing; a real goodbye says "left" once, after the grace time', () => {
    const b = board();
    b.see('socket', [pat, sam]);
    b.see('doc', [sam]);
    // Sam reloads: both links lose Sam, then the new tab comes back.
    b.see('socket', [pat]);
    b.see('doc', []);
    expect(b.wait(2_000)).toEqual([]);
    expect(b.see('socket', [pat, person('2', 'Sam Example', 'tab-2-new')])).toEqual([]);
    expect(b.see('doc', [sam])).toEqual([]);
    expect(b.wait(LEAVE_GRACE_MS)).toEqual([]);

    // Sam closes the tab for good.
    b.see('socket', [pat]);
    b.see('doc', []);
    expect(b.tracker.nextDueIn()).toBe(LEAVE_GRACE_MS);
    expect(b.wait(LEAVE_GRACE_MS - 1)).toEqual([]);
    expect(b.wait(1)).toEqual(['Sam Example left']);
    expect(b.wait(LEAVE_GRACE_MS)).toEqual([]);
    expect(b.tracker.nextDueIn()).toBe(null);
  });

  test('Sam coming back after a real goodbye is announced again', () => {
    const b = board();
    b.see('socket', [pat, sam]);
    b.see('socket', [pat]);
    expect(b.wait(LEAVE_GRACE_MS)).toEqual(['Sam Example left']);
    expect(b.see('socket', [pat, sam])).toEqual(['Sam Example joined the canvas']);
  });

  test('this tab losing its connection is not everyone leaving, however long, and getting it back is not everyone joining', () => {
    const b = board();
    b.see('socket', [pat, sam]);
    b.see('doc', [sam]);
    b.see('doc', null);
    b.see('socket', null);
    expect(b.tracker.nextDueIn()).toBe(null);
    expect(b.wait(RECONNECT_MS * 3)).toEqual([]);
    expect(b.see('doc', [sam])).toEqual([]);
    expect(b.see('socket', [pat, sam])).toEqual([]);
  });

  test('after a server restart everyone comes back at a different moment, and nobody is announced', () => {
    const b = board();
    b.see('socket', [pat, sam]);
    b.see('doc', [sam]);
    b.see('socket', null);
    b.see('doc', null);
    // This tab is back first; Sam's tab only 20 seconds later.
    expect(b.see('socket', [pat])).toEqual([]);
    expect(b.see('doc', [])).toEqual([]);
    expect(b.wait(20_000)).toEqual([]);
    expect(b.see('socket', [pat, sam])).toEqual([]);
    expect(b.see('doc', [sam])).toEqual([]);
    expect(b.wait(RECONNECT_MS)).toEqual([]);
  });

  test('someone who left while this tab was offline is forgotten quietly, and announced if they come back later', () => {
    const b = board();
    b.see('socket', [pat, sam]);
    b.see('socket', null);
    b.see('socket', [pat]);
    expect(b.tracker.nextDueIn()).toBe(RECONNECT_MS);
    expect(b.wait(RECONNECT_MS)).toEqual([]);
    expect(b.tracker.nextDueIn()).toBe(null);
    expect(b.see('socket', [pat, sam])).toEqual(['Sam Example joined the canvas']);
  });

  test('a link dropping right after Sam leaves does not swallow "Sam left"', () => {
    const b = board();
    b.see('socket', [pat, sam]);
    b.see('doc', [sam]);
    b.see('socket', [pat]);
    b.see('doc', []);
    expect(b.wait(3_000)).toEqual([]);
    b.see('doc', null);
    expect(b.wait(LEAVE_GRACE_MS - 3_000)).toEqual(['Sam Example left']);
    expect(b.see('doc', [])).toEqual([]);
  });

  test('someone only one link could see is not "left" when that link drops', () => {
    const b = board();
    b.see('socket', [pat]);
    b.see('doc', []);
    expect(b.see('doc', [sam])).toEqual(['Sam Example joined the canvas']);
    b.see('doc', null);
    expect(b.wait(LEAVE_GRACE_MS)).toEqual([]);
    // Back on, Sam is simply still here.
    expect(b.see('doc', [sam])).toEqual([]);
    // Even after a long outage of that link Sam is never announced again.
    b.see('doc', null);
    expect(b.wait(RECONNECT_MS)).toEqual([]);
    expect(b.see('doc', [sam])).toEqual([]);
  });

  test('your own other tabs never toast; a guest is announced even when the id matches yours', () => {
    const b = board();
    b.see('socket', [pat]);
    expect(b.see('socket', [pat, person('1', 'Pat Example', 'tab-1b')])).toEqual([]);
    expect(b.see('socket', [pat, person('1', 'Made-up guest', 'g-1', 'guest')])).toEqual(['Made-up guest joined the canvas']);
  });

  test('someone without a name is "Someone"', () => {
    const b = board();
    b.see('socket', []);
    expect(b.see('socket', [{ clientId: 'x', actor: { type: 'human', id: '5' } }])).toEqual(['Someone joined the canvas']);
  });

  test('each notice has its own id and the time it was made', () => {
    const b = board();
    b.tracker.see('socket', []);
    const [first] = b.tracker.see('socket', [sam]);
    const [second] = b.tracker.see('socket', [sam, person('3', 'Lee Example')]);
    expect(first.kind).toBe('join');
    expect(first.at).toBe(1_000);
    expect(first.id).not.toBe(second.id);
  });
});

describe('PresenceToasts', () => {
  test('shows newest first, max three, dismissible', () => {
    const mk = (id) => ({ id, kind: 'join', text: `User ${id} joined the canvas` });
    const collaboration = { notices: [mk('1'), mk('2'), mk('3'), mk('4')] };
    render(<PresenceToasts collaboration={collaboration} />);
    expect(screen.getByText('User 4 joined the canvas')).toBeTruthy();
    expect(screen.queryByText('User 1 joined the canvas')).toBeNull();

    fireEvent.click(screen.getAllByTitle('Dismiss')[0]);
    expect(screen.queryByText('User 4 joined the canvas')).toBeNull();
    expect(screen.getByText('User 3 joined the canvas')).toBeTruthy();
  });

  test('auto-dismisses after six seconds even while the canvas keeps re-rendering', () => {
    jest.useFakeTimers();
    try {
      const notice = { id: 'n1', kind: 'join', text: 'Sam joined the canvas' };
      const { rerender } = render(<PresenceToasts collaboration={{ notices: [notice] }} />);
      // Cursor moves re-render the HUD constantly; each one used to restart the timer.
      for (let i = 0; i < 12; i += 1) {
        act(() => { jest.advanceTimersByTime(1000); });
        rerender(<PresenceToasts collaboration={{ notices: [notice], cursors: { tick: i } }} />);
      }
      expect(screen.queryByText('Sam joined the canvas')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('renders nothing without notices', () => {
    const { container } = render(<PresenceToasts collaboration={{ notices: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
