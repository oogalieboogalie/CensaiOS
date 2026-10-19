// Claude Managed Agents (beta): an agent made in the Claude Console runs in
// Anthropic's cloud. A chat is a session (sesn_...) that keeps its history
// on Anthropic's side. Docs: platform.claude.com/docs/en/managed-agents/
// (sessions, events-and-streaming). Shapes checked 2026-10-18.

import { HostedAgentError, joinText, readSse, vendorFetch, vendorJson } from '../http.js';

const BASE = () => process.env.HOSTED_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const LABEL = 'Claude';
const AGENT_ID = /^agent_[A-Za-z0-9]{6,80}$/;
const ENV_ID = /^env_[A-Za-z0-9]{6,80}$/;
const TURN_LIMIT_MS = 10 * 60_000;

function headers(apiKey) {
  return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'managed-agents-2026-04-01' };
}

export const anthropicVendor = {
  id: 'anthropic',
  label: 'Claude',
  product: 'Claude Managed Agents (Anthropic)',
  brand: 'claude',
  keyProvider: 'anthropic',
  keyLabel: 'Anthropic API key',
  billedBy: 'Anthropic',
  howTo: 'In the Claude Console (platform.claude.com), open Managed Agents, make or open an agent, and copy its agent id (agent_...) and the environment id (env_...) it runs in.',
  refLabel: 'Agent id',
  refPlaceholder: 'agent_01...',
  needsEndpoint: true,
  endpointLabel: 'Environment id',
  endpointPlaceholder: 'env_01...',

  normalize({ ref, endpoint }) {
    const agent = String(ref || '').trim();
    const env = String(endpoint || '').trim();
    if (!AGENT_ID.test(agent)) throw new HostedAgentError('A Claude agent id starts with agent_. Copy it from the Claude Console.', 400, 'HOSTED_AGENT_BAD_REF');
    if (!ENV_ID.test(env)) throw new HostedAgentError('Claude also needs the environment id, which starts with env_. It is next to the agent id in the Console.', 400, 'HOSTED_AGENT_BAD_REF');
    return { ref: agent, endpoint: env, settings: {} };
  },

  async describe({ ref, apiKey, fetchImpl }) {
    const agent = await vendorJson({ url: `${BASE()}/v1/agents/${encodeURIComponent(ref)}`, headers: headers(apiKey), label: LABEL, fetchImpl, timeoutMs: 20_000 });
    return { name: agent.name || null, description: agent.description || null, instructions: agent.system || null };
  },

  async send({ ref, endpoint, apiKey, thread, text, fetchImpl, signal }) {
    let session = thread;
    if (!session) {
      const made = await vendorJson({
        url: `${BASE()}/v1/sessions`, method: 'POST', headers: headers(apiKey), label: LABEL, fetchImpl, signal,
        body: { agent: ref, environment_id: endpoint, title: 'censaiOS chat' },
      });
      session = made.id;
      if (!session) throw new HostedAgentError('Claude did not start a session.', 502, 'HOSTED_AGENT_BAD_ANSWER');
    }
    const sessionUrl = `${BASE()}/v1/sessions/${encodeURIComponent(session)}`;
    // A stream only carries events sent after it opens, so open it first.
    const stream = await vendorFetch({
      url: `${sessionUrl}/events/stream`, headers: headers(apiKey), label: LABEL, fetchImpl, signal, accept: 'text/event-stream', timeoutMs: TURN_LIMIT_MS,
    });
    const parts = [];
    let problem = null;
    try {
      await vendorJson({
        url: `${sessionUrl}/events`, method: 'POST', headers: headers(apiKey), label: LABEL, fetchImpl, signal,
        body: { events: [{ type: 'user.message', content: [{ type: 'text', text }] }] },
      });
      await readSse(stream.res, (event) => {
        if (event.type === 'agent.message') parts.push(joinText(event.content));
        if (event.type === 'session.error') {
          problem = event.error?.message ? `Claude reported a problem: ${String(event.error.message).slice(0, 200)}` : 'Claude reported a problem.';
          return true;
        }
        if (event.type === 'session.status_idle') {
          if (event.stop_reason?.type === 'requires_action') problem = 'The Claude agent is waiting for a tool approval, which censaiOS chat cannot give yet. Answer it in the Claude Console.';
          if (event.stop_reason?.type === 'budget_reached') problem = 'The Claude session hit its spending limit.';
          return true;
        }
        return false;
      }, { label: LABEL, signal });
    } finally {
      stream.done();
      stream.res.body?.cancel?.().catch?.(() => {});
    }
    const answer = parts.filter(Boolean).join('\n\n');
    if (!answer && problem) throw new HostedAgentError(problem, 502, 'HOSTED_AGENT_VENDOR_STOPPED');
    return { text: problem ? `${answer}\n\n(${problem})` : answer, thread: session };
  },
};
