// LangChain agents deployed on LangSmith Deployment (formerly LangGraph
// Platform): a deployment address plus an assistant id. A chat is a thread
// that keeps its state on the deployment. Shapes from the Agent Server API
// (docs.langchain.com/langsmith/server-api-ref) and the official
// langgraph-sdk, checked 2026-10-18.

import { HostedAgentError, joinText, vendorJson } from '../http.js';

const LABEL = 'LangChain';
const ASSISTANT = /^[A-Za-z0-9_.:-]{1,120}$/;
const TURN_LIMIT_MS = 10 * 60_000;

/**
 * https only, except a LangGraph dev server on this computer. This checks the
 * shape; whether the address may be reached at all is netGuard.js's call,
 * on every request (private addresses only on the desktop app).
 */
export function deploymentUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new HostedAgentError('Paste the deployment address, like https://my-agent.us.langgraph.app.', 400, 'HOSTED_AGENT_BAD_REF');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new HostedAgentError('The deployment address must start with https:// (http:// only for a dev server on this computer).', 400, 'HOSTED_AGENT_BAD_REF');
  }
  if (url.username || url.password) throw new HostedAgentError('Leave any name or password out of the address.', 400, 'HOSTED_AGENT_BAD_REF');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** The last AI message's words in a run's final state. */
export function lastAiText(state) {
  const messages = Array.isArray(state?.messages) ? state.messages : Array.isArray(state?.values?.messages) ? state.values.messages : [];
  const last = [...messages].reverse().find((m) => m?.type === 'ai' || m?.role === 'assistant');
  return last ? joinText(last.content) : '';
}

const headers = (apiKey) => ({ 'X-Api-Key': apiKey });

export const langchainVendor = {
  id: 'langchain',
  label: 'LangChain',
  product: 'LangSmith Deployment (LangGraph agents)',
  brand: 'langchain',
  keyProvider: 'langsmith',
  keyLabel: 'LangSmith API key',
  billedBy: 'LangSmith and the model keys inside your deployment',
  howTo: 'In LangSmith, open Deployments, pick your deployment and copy its API URL. The assistant id is usually your graph name (often "agent").',
  refLabel: 'Assistant id',
  refPlaceholder: 'agent',
  needsEndpoint: true,
  endpointLabel: 'Deployment address',
  endpointPlaceholder: 'https://my-agent.us.langgraph.app',

  normalize({ ref, endpoint }) {
    const assistant = String(ref || '').trim() || 'agent';
    if (!ASSISTANT.test(assistant)) throw new HostedAgentError('The assistant id is a graph name like "agent" or an assistant id from LangSmith.', 400, 'HOSTED_AGENT_BAD_REF');
    return { ref: assistant, endpoint: deploymentUrl(endpoint), settings: {} };
  },

  async describe({ ref, endpoint, apiKey, fetchImpl }) {
    const assistant = await vendorJson({ url: `${deploymentUrl(endpoint)}/assistants/${encodeURIComponent(ref)}`, headers: headers(apiKey), label: LABEL, fetchImpl, timeoutMs: 20_000 });
    return { name: assistant.name || assistant.graph_id || null, description: assistant.description || null, instructions: null };
  },

  async send({ ref, endpoint, apiKey, thread, text, fetchImpl, signal }) {
    const base = deploymentUrl(endpoint);
    let threadId = thread;
    if (!threadId) {
      const made = await vendorJson({ url: `${base}/threads`, method: 'POST', body: {}, headers: headers(apiKey), label: LABEL, fetchImpl, signal });
      threadId = made.thread_id;
      if (!threadId) throw new HostedAgentError('The LangChain deployment did not start a thread.', 502, 'HOSTED_AGENT_BAD_ANSWER');
    }
    const state = await vendorJson({
      url: `${base}/threads/${encodeURIComponent(threadId)}/runs/wait`, method: 'POST', headers: headers(apiKey), label: LABEL, fetchImpl, signal, timeoutMs: TURN_LIMIT_MS,
      body: { assistant_id: ref, input: { messages: [{ role: 'user', content: text }] } },
    });
    if (state?.__error__) throw new HostedAgentError('The LangChain agent stopped with an error. See the run in LangSmith.', 502, 'HOSTED_AGENT_VENDOR_STOPPED');
    return { text: lastAiText(state), thread: threadId };
  },
};
