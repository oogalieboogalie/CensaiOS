/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { mergeCollaborationPreviews } from '../src/app/hooks/useWorkspaceCollaboration.js';
import { diffPresenceNotices } from '../src/lib/collaboration/liveText.js';
import {
  setLivePresenceSenders,
  resetLivePresenceSenders,
  reportTyping,
  reportTextPreview,
  reportCursor,
} from '../src/lib/collaboration/liveText.js';
import { CanvasCursors } from '../src/components/canvas/CanvasCursors.jsx';
import { PresenceToasts } from '../src/components/PresenceToasts.jsx';

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
          a: { clientId: 'a', x: 10, y: 20, actor: { label: 'Alex' } },
          bad: { clientId: 'bad', x: Infinity, y: 0 },
        }}
      />
    );
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getAllByTestId('remote-cursor')).toHaveLength(1);
  });

  test('renders nothing without cursors', () => {
    const { container } = render(<CanvasCursors cursors={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('diffPresenceNotices', () => {
  const a = { clientId: 'a', actor: { label: 'Alex' } };
  const b = { clientId: 'b', actor: { label: 'Sam' } };

  test('join and leave notices with labels', () => {
    const notices = diffPresenceNotices([a], [a, b]);
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe('join');
    expect(notices[0].text).toBe('Sam joined the canvas');

    const left = diffPresenceNotices([a, b], [a]);
    expect(left).toHaveLength(1);
    expect(left[0].kind).toBe('leave');
    expect(left[0].text).toBe('Sam left');
  });

  test('no notices without changes', () => {
    expect(diffPresenceNotices([a], [a])).toEqual([]);
    expect(diffPresenceNotices([], [])).toEqual([]);
  });

  test('falls back to Someone without a label', () => {
    const notices = diffPresenceNotices([], [{ clientId: 'x', actor: {} }]);
    expect(notices[0].text).toBe('Someone joined the canvas');
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

  test('renders nothing without notices', () => {
    const { container } = render(<PresenceToasts collaboration={{ notices: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
