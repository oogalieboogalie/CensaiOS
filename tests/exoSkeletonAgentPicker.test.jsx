/** @jest-environment jsdom */
import { exoSkeletonAgentId } from '../src/components/ExoSkeletonWindow.jsx';

describe('Exo-Skeleton agent picker', () => {
  test('a picked agent wins over an attached one', () => {
    expect(exoSkeletonAgentId({ agentId: 'atlas', attachedAgents: ['nexus'] })).toBe('atlas');
  });

  test('falls back to the first attached built-in agent, then The Architect', () => {
    expect(exoSkeletonAgentId({ attachedAgents: ['custom-bot', 'Nexus'] })).toBe('nexus');
    expect(exoSkeletonAgentId({ attachedAgents: ['custom-bot'] })).toBe('architect');
    expect(exoSkeletonAgentId({})).toBe('architect');
  });
});
