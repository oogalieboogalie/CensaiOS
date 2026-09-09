/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { ChatBubble } from '../src/components/chat/ChatBubble.jsx';

describe('chat change-impact breadcrumbs', () => {
  test('keeps the semantic middleware receipt on the agent response', () => {
    const message = {
      from: 'agent',
      text: 'Implemented the tool.',
      activity: {
        totalMs: 100,
        modelMs: 80,
        toolMs: 20,
        rounds: 1,
        tools: [],
        changeImpact: {
          risk: 'normal',
          breadcrumbs: [{
            domain: 'agent-tool',
            label: 'Agent tool',
            risk: 'normal',
            surfaces: ['server/tools/definitions/', 'server/tools/handlers/'],
            checks: ['definition and handler both exist'],
          }],
        },
      },
    };

    const { getByText } = render(
      React.createElement(ChatBubble, {
        message,
        index: 0,
        copied: false,
        onCopy: () => {},
      })
    );

    fireEvent.click(getByText('details'));
    getByText('change-impact breadcrumbs · normal risk');
    getByText('Agent tool');
    getByText('server/tools/definitions/ · server/tools/handlers/');
  });
});

