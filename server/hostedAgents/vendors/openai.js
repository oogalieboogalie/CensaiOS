// OpenAI Agents API (beta): a saved agent in the person's OpenAI project. A
// chat is an agent session that keeps its turns on OpenAI's side.
// Shapes from the official openai-python SDK (resources/beta/agents) and
// developers.openai.com/api/docs/guides/agents-api, checked 2026-10-18.
// The older Assistants API shut down on 2026-08-26, and Agent Builder
// workflows (wf_...) can only be used through OpenAI's ChatKit widget and
// shut down on 2026-11-30, so neither is offered here.

import { HostedAgentError, readSse, vendorFetch, vendorJson } from '../http.js';

const BASE = () => process.env.HOSTED_OPENAI_BASE_URL || 'https://api.openai.com';
const LABEL = 'OpenAI';
const AGENT_ID = /^[A-Za-z0-9_-]{3,120}$/;
const TURN_LIMIT_MS = 10 * 60_000;

function headers(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, 'OpenAI-Beta': 'agents=v1' };
}

/** Collect the finished text of one turn from the session's event stream. */
export function openAiTurnReader(parts, state, sentAfter = 0) {
  return (event) => {
    const type = String(event?.type || '');
    // A stream that replays earlier turns: skip anything stamped before this message.
    if (sentAfter && Number(event?.created_at) && Number(event.created_at) < sentAfter) return false;
    if (type === 'agent.session.turn.output_text.done' && event.text) parts.push(String(event.text));
    if (type === 'agent.session.turn.failed' || type === 'agent.session.error') {
      state.problem = 'OpenAI could not finish the answer.';
      return true;
    }
    if (type === 'agent.session.requires_action') {
      state.problem = 'The OpenAI agent is waiting for an approval, which censaiOS chat cannot give yet.';
      return true;
    }
    return type === 'agent.session.turn.completed' || type === 'agent.session.idle';
  };
}

export const openaiVendor = {
  id: 'openai',
  label: 'OpenAI',
  product: 'OpenAI Agents API (beta)',
  brand: 'openai',
  keyProvider: 'openai',
  keyLabel: 'OpenAI API key',
  billedBy: 'OpenAI',
  howTo: 'Paste the id of an agent saved in your OpenAI project (Agents API). The key needs agent read and write access. Agent Builder workflow ids (wf_...) do not work outside OpenAI\'s own chat widget.',
  refLabel: 'Agent id',
  refPlaceholder: 'Your OpenAI agent id',

  normalize({ ref }) {
    const agent = String(ref || '').trim();
    if (/^wf_/.test(agent)) {
      throw new HostedAgentError('That is an Agent Builder workflow id. OpenAI only runs those inside its own ChatKit widget (and retires them on 2026-11-30), so they cannot join a board. Use an Agents API agent id instead.', 400, 'HOSTED_AGENT_BAD_REF');
    }
    if (/^asst_/.test(agent)) {
      throw new HostedAgentError('That is an Assistant id. OpenAI shut the Assistants API down on 2026-08-26. Use an Agents API agent id instead.', 400, 'HOSTED_AGENT_BAD_REF');
    }
    if (!AGENT_ID.test(agent)) throw new HostedAgentError('Paste the OpenAI agent id.', 400, 'HOSTED_AGENT_BAD_REF');
    return { ref: agent, endpoint: null, settings: {} };
  },

  async describe({ ref, apiKey, fetchImpl }) {
    const agent = await vendorJson({ url: `${BASE()}/v1/agents/${encodeURIComponent(ref)}`, headers: headers(apiKey), label: LABEL, fetchImpl, timeoutMs: 20_000 });
    return { name: agent.name || null, description: agent.description || null, instructions: agent.instructions || null };
  },

  async send({ ref, apiKey, thread, text, fetchImpl, signal }) {
    const parts = [];
    const state = { problem: null };
    let session = thread;
    if (!session) {
      // A new session takes the first message and streams its own events.
      const stream = await vendorFetch({
        url: `${BASE()}/v1/agents/sessions`, method: 'POST', headers: headers(apiKey), label: LABEL, fetchImpl, signal,
        accept: 'text/event-stream', timeoutMs: TURN_LIMIT_MS,
        body: { agent_id: ref, environment: { type: 'none' }, input: text, stream: true },
      });
      try {
        const read = openAiTurnReader(parts, state);
        await readSse(stream.res, (event) => {
          session = session || event.session_id || event.session?.id || null;
          return read(event);
        }, { label: LABEL, signal });
      } finally {
        stream.done();
        stream.res.body?.cancel?.().catch?.(() => {});
      }
    } else {
      const sessionUrl = `${BASE()}/v1/agents/sessions/${encodeURIComponent(session)}`;
      const sentAfter = Math.floor(Date.now() / 1000) - 1;
      const stream = await vendorFetch({ url: `${sessionUrl}/events`, headers: headers(apiKey), label: LABEL, fetchImpl, signal, accept: 'text/event-stream', timeoutMs: TURN_LIMIT_MS });
      try {
        await vendorJson({
          url: `${sessionUrl}/events`, method: 'POST', headers: headers(apiKey), label: LABEL, fetchImpl, signal,
          body: { events: [{ type: 'agent.session.input.message', input: [{ role: 'user', type: 'message', content: [{ type: 'input_text', text }] }] }] },
        });
        await readSse(stream.res, openAiTurnReader(parts, state, sentAfter), { label: LABEL, signal });
      } finally {
        stream.done();
        stream.res.body?.cancel?.().catch?.(() => {});
      }
    }
    const answer = parts.join('\n\n');
    if (!answer && state.problem) throw new HostedAgentError(state.problem, 502, 'HOSTED_AGENT_VENDOR_STOPPED');
    return { text: state.problem ? `${answer}\n\n(${state.problem})` : answer, thread: session };
  },
};
