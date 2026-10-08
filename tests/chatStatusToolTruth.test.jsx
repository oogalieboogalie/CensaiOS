/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { ChatStatus } from '../src/components/chat/ChatStatus.jsx';
import { ChatBubble } from '../src/components/chat/ChatBubble.jsx';
import fs from 'node:fs';
import path from 'node:path';

const thinking = { status: 'thinking', detail: null };

function renderStatus(activityLog) {
  return render(React.createElement(ChatStatus, { liveStatus: thinking, activityLog }));
}

describe('ChatStatus tool truth chips', () => {
  test('ok:false completed_tool rows render the failed card (✗ icon, "· failed")', () => {
    const { container, getByText } = renderStatus([{ tool: 'send_email', ms: 80, ok: false }]);

    const cross = container.querySelector('[data-tool-outcome="failed"]');
    expect(cross).not.toBeNull();
    expect(cross.closest('.hb-tool').dataset.outcome).toBe('failed');
    expect(container.querySelector('[data-tool-outcome="ok"]')).toBeNull();
    getByText('Ran send_email · failed');
  });

  test('ok:true rows keep the success style', () => {
    const { container, getByText } = renderStatus([
      { tool: 'web_search', summary: { target: 'postgres healthcheck' }, ms: 120, ok: true },
    ]);

    const check = container.querySelector('[data-tool-outcome="ok"]');
    expect(check).not.toBeNull();
    expect(check.closest('.hb-tool').dataset.outcome).toBe('ok');
    expect(container.querySelector('[data-tool-outcome="failed"]')).toBeNull();
    getByText('Searched the web “postgres healthcheck”');
  });

  test('legacy details without ok render as success (back-compat)', () => {
    const { container } = renderStatus([{ tool: 'recall', ms: 15 }]);
    expect(container.querySelector('[data-tool-outcome="ok"]')).not.toBeNull();
    expect(container.querySelector('[data-tool-outcome="failed"]')).toBeNull();
  });

  test('the call in flight shows as a pulsing running card', () => {
    const { container, getByText } = render(React.createElement(ChatStatus, {
      liveStatus: { status: 'calling_tool', detail: { tool: 'web_search', summary: { target: 'oklch' } } },
      activityLog: [],
    }));
    expect(container.querySelector('.hb-tool[data-state="running"]')).not.toBeNull();
    getByText('Searching the web “oklch”');
  });

  test('failed rows use the danger color in the stylesheet', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/chat.css'), 'utf8');
    expect(css).toMatch(/\.hb-tool\[data-outcome="failed"\] \.hb-tool-label \{ color: var\(--danger\); \}/);
  });
});

describe('ChatBubble tool cards', () => {
  test('a finished reply keeps one card per tool call; failed ones are marked and expand to details', () => {
    const message = {
      from: 'agent',
      text: 'Mail server is fine.',
      activity: {
        totalMs: 900,
        modelMs: 700,
        toolMs: 200,
        rounds: 2,
        tools: [
          { name: 'mailcow_domains', ms: 80, ok: false },
          { name: 'web_search', ms: 120, ok: true, summary: { target: 'mailcow' } },
        ],
      },
    };
    const { container, getByText } = render(
      React.createElement(ChatBubble, { message, index: 0, copied: false, onCopy: () => {} })
    );

    const cards = container.querySelectorAll('.hb-tool');
    expect(cards).toHaveLength(2);
    expect(cards[0].dataset.outcome).toBe('failed');
    expect(cards[1].dataset.outcome).toBe('ok');
    getByText('Ran mailcow_domains · failed');

    fireEvent.click(getByText('Ran mailcow_domains · failed'));
    getByText('Outcome');
    getByText('Failed');
    // Total time rides along with the hover actions.
    getByText('900ms');
  });
});
