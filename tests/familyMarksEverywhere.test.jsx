/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { SchedulerAgentSelect } from '../src/components/scheduler/SchedulerAgentSelect.jsx';
import { ActiveAgentsPanel } from '../src/components/operations/ActiveAgentsPanel.jsx';
import { SubAgentRoster } from '../src/components/group/SubAgentRoster.jsx';
import { SCHEDULER_AGENTS } from '../src/components/scheduler/constants.js';

// The Scheduler's picker, Active Agents and a Group's sub-agents draw agent
// faces through AgentAvatar (the family mark), never a plain letter.

const marks = (container) => [...container.querySelectorAll('.hb-agent-mark')];

describe('family marks everywhere an agent shows', () => {
  test('Scheduler picker: every agent wears its mark; the picked one gets a ring', () => {
    const pick = jest.fn();
    const { container } = render(<SchedulerAgentSelect selectedAgentId="atlas" setSelectedAgentId={pick} />);
    const faces = marks(container);
    expect(faces).toHaveLength(SCHEDULER_AGENTS.length);
    expect(faces.map(f => f.getAttribute('data-family-mark'))).toContain('censai');
    expect(container.querySelector('[data-family-mark="atlas"]').getAttribute('data-ring')).toBe('true');
    expect(container.querySelector('.hb-sched-glyph')).toBeNull();
    fireEvent.click(container.querySelector('[data-family-mark="nexus"]'));
    expect(pick).toHaveBeenCalledWith('nexus');
  });

  test('Active Agents: family agents keep their mark, others wear it in their own colour', () => {
    const activeAgents = [
      { id: 'atlas', name: 'Atlas', detail: 'Nightly backup', kind: 'schedule', tone: 'live', hue: 220 },
      { id: 'sub-1', name: 'Pat helper', detail: 'Summarize notes', kind: 'task', tone: 'live', hue: 40 },
      { id: 'jules', name: 'Jules', detail: '1 active session', kind: 'jules', tone: 'live', hue: 285 },
    ];
    const { container } = render(<ActiveAgentsPanel activeAgents={activeAgents} />);
    const faces = marks(container);
    expect(faces).toHaveLength(3);
    expect(faces[0].getAttribute('data-family-mark')).toBe('atlas');
    expect(faces[1].getAttribute('data-family-mark')).toBeNull();
    expect(faces[1].style.getPropertyValue('--agent-h')).toBe('40');
    // No letter tile: each row starts with the mark, then the name.
    expect(faces[0].parentElement.children[1].textContent).toBe('AtlasNightly backup');
  });

  test('Group sub-agents: each wears the mark with its name and role on hover', () => {
    const subAgents = [
      { id: 's1', parent_id: 'atlas', name: 'Mo', role: 'Researcher', hue: 120 },
      { id: 's2', parent_id: 'atlas', name: 'Sam', role: null },
    ];
    const { container } = render(
      <SubAgentRoster subAgents={subAgents} setSubAgents={() => {}} members={[{ id: 'atlas', name: 'Atlas' }]} groupHue={260}
        creating={false} setCreating={() => {}} newParent="atlas" setNewParent={() => {}} />,
    );
    const faces = marks(container);
    expect(faces).toHaveLength(2);
    expect(faces[0].title).toBe('Mo — Researcher');
    expect(faces[1].title).toBe('Sam — Sub-agent');
    expect(faces[1].style.getPropertyValue('--agent-h')).toBe('260');
  });
});

describe('window header keeps the agent mark', () => {
  // A chat at its default width has a project chip and tool buttons that
  // used to squeeze the title, mark included, down to nothing.
  const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/window-chrome.css'), 'utf8');
  test('the title never shrinks below the mark, and the project chip gives way first', () => {
    expect(css).toMatch(/\.hb-win-title:has\(\.hb-win-identity\) \{ min-width: var\(--space-5\); \}/);
    expect(css).toMatch(/\.hb-win-project \{[^}]*flex: 0 1 auto; min-width: var\(--space-6\);/);
  });
});
