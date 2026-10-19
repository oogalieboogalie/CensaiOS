/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GithubRepoPull } from '../src/components/windows/agentDesigner/GithubRepoPull.jsx';

afterEach(cleanup);

const agent = (name, platform, platformLabel, sourceFile) => ({ name, platform, platformLabel, sourceFile, instructions: 'x', carried: [], notCarried: [] });

test('pulls a repo, lists each agent with its platform, imports the ticked ones', async () => {
  const calls = [];
  global.fetch = jest.fn(async (url, opts) => {
    calls.push([url, JSON.parse(opts.body)]);
    if (url === '/api/agent-import/github') {
      return { ok: true, json: async () => ({ repo: 'jordan/shop-agents', branch: 'main', capped: false, skipped: [], agents: [
        agent('code-reviewer', 'claude', 'Claude', '.claude/agents/code-reviewer.md'),
        agent('support_agent', 'google-adk', 'Google ADK', 'agents/support/agent.py'),
        agent('Grok Scout', 'grok', 'Grok (xAI)', 'agents/grok-agent.json'),
      ] }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const importAgent = jest.fn(async () => true);
  render(<GithubRepoPull importAgent={importAgent} />);
  fireEvent.change(screen.getByTestId('github-repo-input'), { target: { value: 'jordan/shop-agents' } });
  fireEvent.click(screen.getByTestId('import-github-repo'));
  await screen.findByText('Grok Scout');
  expect(calls[0]).toEqual(['/api/agent-import/github', { repo: 'jordan/shop-agents' }]);
  expect(screen.getByTestId('github-pull-summary')).toHaveTextContent('Found 3 agents in jordan/shop-agents (main)');
  expect(screen.getByText('support_agent').parentElement).toHaveTextContent('Google ADK');

  fireEvent.click(screen.getByLabelText('Import support_agent'));
  fireEvent.click(screen.getByTestId('github-pull-import'));
  await waitFor(() => expect(importAgent).toHaveBeenCalledTimes(2));
  expect(importAgent.mock.calls.map(c => c[0].name)).toEqual(['code-reviewer', 'Grok Scout']);
  await waitFor(() => expect(calls.at(-1)).toEqual(['/api/agent-import/github/imported', { repo: 'jordan/shop-agents', names: ['code-reviewer', 'Grok Scout'] }]));
});

test('a repo GitHub cannot show says so in plain words', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'That repo was not found, or your GitHub sign-in cannot see it.' }) }));
  render(<GithubRepoPull importAgent={jest.fn()} />);
  fireEvent.change(screen.getByTestId('github-repo-input'), { target: { value: 'jordan/nothing' } });
  fireEvent.click(screen.getByTestId('import-github-repo'));
  expect(await screen.findByRole('alert')).toHaveTextContent('not found');
});
