/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MailcowWindow } from '../src/components/MailcowWindow.jsx';
import { WindowFrame } from '../src/components/Windows.jsx';
import { TodosWindow } from '../src/components/TodosWindow.jsx';
import { ChatWindow } from '../src/components/ChatWindow.jsx';
import { CalendarWindow } from '../src/components/CalendarWindow.jsx';
import { api } from '../src/lib/api.js';

describe('React Jest harness', () => {
  test('renders JSX in jsdom', () => {
    render(<section aria-label="Jest React Harness">ready</section>);

    expect(screen.getByLabelText('Jest React Harness')).toHaveTextContent('ready');
  });

  test('renders a real window frame with controls and attached-agent accent lookup', () => {
    render(
      React.createElement(
        WindowFrame,
        {
          win: {
            id: 'win-chat',
            kind: 'chat',
            x: 12,
            y: 18,
            w: 360,
            h: 420,
            attachedAgents: ['censai'],
          },
          onUpdate: jest.fn(),
          onClose: jest.fn(),
          onSelect: jest.fn(),
          isActive: true,
          allWins: [],
        },
        <div>Chat renderer mounted</div>
      )
    );

    expect(screen.getByText('Chat renderer mounted')).toBeInTheDocument();
    expect(screen.getByTitle('Close window')).toBeInTheDocument();
    expect(screen.getByTitle('Maximize window')).toBeInTheDocument();
    expect(screen.getByTitle('Pin to screen')).toBeInTheDocument();
  });

  test('renders the Mailcow setup state from the split hook and tab components', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (url === '/api/mailcow/health') {
        return {
          ok: true,
          json: async () => ({ configured: false, ok: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock;

    render(
      React.createElement(MailcowWindow, {
        win: { id: 'mailcow', title: 'Mailcow' },
        onUpdate: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(screen.getByText('Mailcow Not Configured')).toBeInTheDocument();
    });
    expect(screen.getByText(/MAILCOW_URL=https:\/\/mail\.censai\.app/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/mailcow/health');
  });

  test('WindowFrame preserves child component instance and DOM element when win.pinned is toggled', () => {
    let mountCount = 0;
    let unmountCount = 0;

    const TestChild = () => {
      React.useEffect(() => {
        mountCount++;
        return () => {
          unmountCount++;
        };
      }, []);
      return <div data-testid="child-elem">Content</div>;
    };

    const { rerender } = render(
      React.createElement(
        WindowFrame,
        {
          win: {
            id: 'test-win',
            kind: 'calendar',
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            pinned: false,
          },
          onUpdate: jest.fn(),
          onClose: jest.fn(),
          onSelect: jest.fn(),
          isActive: true,
          allWins: [],
        },
        React.createElement(TestChild)
      )
    );

    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);

    const firstElement = screen.getByTestId('child-elem');

    // Toggle pinned state to true
    rerender(
      React.createElement(
        WindowFrame,
        {
          win: {
            id: 'test-win',
            kind: 'calendar',
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            pinned: true,
          },
          onUpdate: jest.fn(),
          onClose: jest.fn(),
          onSelect: jest.fn(),
          isActive: true,
          allWins: [],
        },
        React.createElement(TestChild)
      )
    );

    // Verify it didn't unmount and mount again
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);

    const secondElement = screen.getByTestId('child-elem');
    expect(firstElement).toBe(secondElement);
  });

  test('CalendarWindow restores persisted view mode and date after a pin-style remount', async () => {
    const events = [
      {
        id: 'evt-1',
        title: 'Design review',
        description: '',
        start: '2026-06-18T15:00:00.000Z',
        end: '2026-06-18T16:00:00.000Z',
        link: '',
        color: '#ff0000',
      },
    ];
    const getCalendarEventsSpy = jest.spyOn(api, 'getCalendarEvents').mockResolvedValue(events);

    const initialWin = {
      id: 'calendar-1',
      kind: 'calendar',
      title: 'Calendar',
      data: {},
    };
    let currentWin = initialWin;
    const onUpdate = jest.fn((patch) => {
      currentWin = {
        ...currentWin,
        ...patch,
        data: {
          ...(currentWin.data || {}),
          ...(patch.data || {}),
        },
      };
    });

    try {
      const { rerender, unmount } = render(
        React.createElement(CalendarWindow, { win: currentWin, onUpdate, onSpawn: jest.fn() })
      );

      await waitFor(() => {
        expect(getCalendarEventsSpy).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByText('List'));
      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({
            calendar: expect.objectContaining({ viewMode: 'list' }),
          }),
        }));
      });

      rerender(React.createElement(CalendarWindow, { win: currentWin, onUpdate, onSpawn: jest.fn() }));

      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({
            calendar: expect.objectContaining({
              viewMode: 'list',
              currentDate: expect.any(String),
            }),
          }),
        }));
      });

      const persistedDate = currentWin.data?.calendar?.currentDate;
      expect(persistedDate).toBeTruthy();

      unmount();
      render(React.createElement(CalendarWindow, { win: currentWin, onUpdate, onSpawn: jest.fn() }));

      await waitFor(() => {
        expect(screen.getByText('List')).toHaveStyle({ background: 'var(--hairline)' });
      });
      expect(screen.getByText(new Date(persistedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }))).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('Design review')).toBeInTheDocument();
      });
    } finally {
      getCalendarEventsSpy.mockRestore();
    }
  });

  test('TodosWindow toggles task with animation delay and groups completed items', async () => {
    jest.useFakeTimers();

    const onUpdateMock = jest.fn();
    const win = {
      id: 'todos-1',
      kind: 'todos',
      title: 'My Todos',
      items: [
        { id: 1, text: 'Active Task', done: false, assignee: null },
        { id: 2, text: 'Completed Task', done: true, assignee: null },
      ],
    };

    render(
      React.createElement(TodosWindow, {
        win,
        onUpdate: onUpdateMock,
        currentProject: null,
      })
    );

    // Active Task should be in the active list and visible
    expect(screen.getByText('Active Task')).toBeInTheDocument();

    // Completed Tasks collapsible button should exist
    const completedBtn = screen.getByText('Completed Tasks (1)');
    expect(completedBtn).toBeInTheDocument();

    // Completed Task should be hidden because it is collapsed
    expect(screen.queryByText('Completed Task')).not.toBeInTheDocument();

    // Find the toggle checkbox button of Active Task and click it
    const activeSpan = screen.getByText('Active Task');
    const rowDiv = activeSpan.parentElement.parentElement;
    // Find the checkbox button (which is the first button inside the row)
    const checkboxBtn = rowDiv.querySelector('button');

    act(() => {
      checkboxBtn.click();
    });

    // onUpdate should NOT have been called yet due to the animation delay
    expect(onUpdateMock).not.toHaveBeenCalled();

    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(250);
    });

    // Now onUpdate should have been called to toggle the item in storage
    expect(onUpdateMock).toHaveBeenCalledTimes(1);
    expect(onUpdateMock).toHaveBeenCalledWith({
      items: [
        { id: 1, text: 'Active Task', done: true, assignee: null },
        { id: 2, text: 'Completed Task', done: true, assignee: null },
      ],
    });

    jest.useRealTimers();
  });

  test('ChatWindow auto-sends message on mount when win.autoSend is true', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (url === '/api/chat') {
        return {
          ok: true,
          headers: {
            get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null,
          },
          json: async () => ({
            text: 'Hello! I am Censai, how can I help you?',
            timings: { total_ms: 10 },
            tools: [],
          }),
        };
      }
      if (url.startsWith('/api/local-dev-restarts/notifications')) {
        return {
          ok: true,
          json: async () => ([]),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock;

    const onUpdateMock = jest.fn();
    const win = {
      id: 'chat-1',
      kind: 'chat',
      agentId: 'censai',
      msgs: [{ from: 'me', text: 'Re: "Hello world"\n\nI need help' }],
      autoSend: true,
    };

    render(
      React.createElement(ChatWindow, {
        win,
        onUpdate: onUpdateMock,
        allWins: [],
        canvasGroups: [],
        currentProject: null,
        isActive: true,
      })
    );

    // It should immediately clear the autoSend flag via onUpdate
    expect(onUpdateMock).toHaveBeenNthCalledWith(1, { autoSend: false });

    // It should fetch from /api/chat
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Wait for the second call to onUpdateMock which passes the updated msgs
    await waitFor(() => {
      expect(onUpdateMock).toHaveBeenCalledTimes(2);
    });

    // Verify the second call passes the agent reply
    const secondCallArg = onUpdateMock.mock.calls[1][0];
    expect(secondCallArg).toHaveProperty('msgs');
    expect(secondCallArg.msgs).toHaveLength(2);
    expect(secondCallArg.msgs[1]).toEqual(
      expect.objectContaining({
        from: 'censai',
        text: 'Hello! I am Censai, how can I help you?',
      })
    );
  });

  test('TodosWindow supports double-clicking a task to edit it', () => {
    const onUpdateMock = jest.fn();
    const win = {
      id: 'todos-1',
      kind: 'todos',
      title: 'My Todos',
      items: [
        { id: 1, text: 'Active Task', done: false, assignee: null },
      ],
    };

    render(
      React.createElement(TodosWindow, {
        win,
        onUpdate: onUpdateMock,
        currentProject: null,
      })
    );

    const activeSpan = screen.getByText('Active Task');
    expect(activeSpan).toBeInTheDocument();

    // Double-click to start edit
    act(() => {
      fireEvent.doubleClick(activeSpan);
    });

    // Input should be visible
    const input = screen.getByDisplayValue('Active Task');
    expect(input).toBeInTheDocument();

    // Change input value
    act(() => {
      fireEvent.change(input, { target: { value: 'Active Task Edited' } });
    });

    // Press Enter to save
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    });

    // onUpdate should have been called with the updated item
    expect(onUpdateMock).toHaveBeenCalledTimes(1);
    expect(onUpdateMock).toHaveBeenCalledWith({
      items: [
        { id: 1, text: 'Active Task Edited', done: false, assignee: null },
      ],
    });
  });
});
