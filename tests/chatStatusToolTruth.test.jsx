/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { ChatStatus } from '../src/components/chat/ChatStatus.jsx';
import { ChatBubble } from '../src/components/chat/ChatBubble.jsx';

const thinking = { status: 'thinking', detail: null };

function renderStatus(activityLog) {
  return render(React.createElement(ChatStatus, { liveStatus: thinking, activityLog }));
}

describe('ChatStatus tool truth chips', () => {
  test('ok:false completed_tool rows render the failed style (red ✗, "— failed")', () => {
    const { container, getByText } = renderStatus([{ tool: 'send_email', ms: 80, ok: false }]);

    const cross = container.querySelector('[data-tool-outcome="failed"]');
    expect(cross).not.toBeNull();
    expect(cross.style.color).toBe('var(--ps-red)');
    expect(container.querySelector('[data-tool-outcome="ok"]')).toBeNull();

    const label = getByText('Ran send_email — failed');
    expect(label.parentElement.style.color).toBe('var(--ps-red)');
  });

  test('ok:true rows keep the success style', () => {
    const { container, getByText } = renderStatus([
      { tool: 'web_search', summary: { target: 'postgres healthcheck' }, ms: 120, ok: true },
    ]);

    const check = container.querySelector('[data-tool-outcome="ok"]');
    expect(check).not.toBeNull();
    expect(check.style.color).toBe('var(--accent-ink)');
    expect(container.querySelector('[data-tool-outcome="failed"]')).toBeNull();
    getByText('Searched the web “postgres healthcheck”');
  });

  test('legacy details without ok render as success (back-compat)', () => {
    const { container } = renderStatus([{ tool: 'recall', ms: 15 }]);
    expect(container.querySelector('[data-tool-outcome="ok"]')).not.toBeNull();
    expect(container.querySelector('[data-tool-outcome="failed"]')).toBeNull();
  });
});

describe('ChatBubble activity strip tool truth chips', () => {
  test('the persistent per-message strip marks failed tools red with ✗', () => {
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
          { name: 'web_search', ms: 120, ok: true },
        ],
      },
    };
    const { container, getByText } = render(
      React.createElement(ChatBubble, { message, index: 0, copied: false, onCopy: () => {} })
    );

    fireEvent.click(getByText('details'));

    const failedChip = container.querySelector('[data-tool-outcome="failed"]');
    expect(failedChip).not.toBeNull();
    expect(failedChip.textContent).toBe('✗ mailcow_domains');
    expect(failedChip.style.color).toBe('var(--ps-red)');
    expect(getByText('failed').style.color).toBe('var(--ps-red)');

    const okChip = container.querySelector('[data-tool-outcome="ok"]');
    expect(okChip.textContent).toBe('web_search');
    expect(okChip.style.color).toBe('var(--accent-ink)');
  });
});
