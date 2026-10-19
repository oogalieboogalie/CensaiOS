// Google Agent Engine (Vertex AI Agent Engine, now "Agent Runtime" in the
// Gemini Enterprise Agent Platform): an ADK agent deployed to the person's
// Google Cloud project. A chat is an Agent Engine session kept on Google's
// side. Shapes from the live aiplatform discovery document (v1) and the
// official python-aiplatform AdkApp (async_create_session,
// async_stream_query), checked 2026-10-18.

import { HostedAgentError, joinText, readSse, vendorFetch, vendorJson } from '../http.js';
import { googleAuthHeaders, readGoogleCredential } from './googleAuth.js';

const LABEL = 'Google';
const FULL = /projects\/([a-z0-9-]{4,40}|\d{4,20})\/locations\/([a-z0-9-]{2,40})\/reasoningEngines\/(\d{3,30})/;
const EXPRESS = /^(?:reasoningEngines\/)?(\d{3,30})$/;
const TURN_LIMIT_MS = 10 * 60_000;

/** Where the agent lives: regional (project + location) or express mode (id only). */
export function engineUrl({ project, location, engineId }) {
  const override = process.env.HOSTED_GOOGLE_BASE_URL;
  if (!project) return `${override || 'https://aiplatform.googleapis.com'}/v1/reasoningEngines/${engineId}`;
  return `${override || `https://${location}-aiplatform.googleapis.com`}/v1/projects/${project}/locations/${location}/reasoningEngines/${engineId}`;
}

/** The model's words in one ADK event (skips tool calls, thoughts and partial chunks). */
export function adkEventText(event) {
  if (!event || event.partial === true) return '';
  const content = event.content || {};
  if (content.role && content.role !== 'model') return '';
  const parts = (Array.isArray(content.parts) ? content.parts : []).filter((part) => part?.text && !part.thought);
  return joinText(parts.map((part) => ({ type: 'text', text: part.text })));
}

export const googleVendor = {
  id: 'google',
  label: 'Google',
  product: 'Google Agent Engine (Vertex AI)',
  brand: 'googlecloud',
  keyProvider: 'googlecloud',
  keyLabel: 'Google Cloud key',
  billedBy: 'Google Cloud',
  howTo: 'In the Google Cloud console, open Agent Engine, pick your deployed agent and copy its resource name (projects/.../locations/.../reasoningEngines/...). The key is a service account key file with the Vertex AI User role, or an express mode API key.',
  refLabel: 'Resource name',
  refPlaceholder: 'projects/my-project/locations/us-central1/reasoningEngines/1234567890',

  normalize({ ref }) {
    const text = String(ref || '').trim();
    const full = text.match(FULL);
    if (full) {
      const [, project, location, engineId] = full;
      return { ref: `projects/${project}/locations/${location}/reasoningEngines/${engineId}`, endpoint: null, settings: { project, location, engineId } };
    }
    const express = text.match(EXPRESS);
    if (express) return { ref: `reasoningEngines/${express[1]}`, endpoint: null, settings: { project: null, location: null, engineId: express[1] } };
    throw new HostedAgentError('Paste the agent\'s resource name. It looks like projects/<project>/locations/<region>/reasoningEngines/<number>.', 400, 'HOSTED_AGENT_BAD_REF');
  },

  async describe({ settings, apiKey, fetchImpl }) {
    const credential = readGoogleCredential(apiKey);
    if (!settings.project && credential.kind !== 'apiKey') {
      throw new HostedAgentError('An agent id without a project only works with an express mode API key. Paste the full resource name instead.', 400, 'HOSTED_AGENT_BAD_REF');
    }
    const auth = await googleAuthHeaders(credential, { fetchImpl });
    const engine = await vendorJson({ url: engineUrl(settings), headers: auth, label: LABEL, fetchImpl, timeoutMs: 20_000 });
    return { name: engine.displayName || null, description: engine.description || null, instructions: null };
  },

  async send({ settings, apiKey, thread, text, person, fetchImpl, signal }) {
    const credential = readGoogleCredential(apiKey);
    const auth = await googleAuthHeaders(credential, { fetchImpl, signal });
    const url = engineUrl(settings);
    const userId = String(person || 'censai-user').slice(0, 120);
    let session = thread;
    if (!session) {
      const made = await vendorJson({
        url: `${url}:query`, method: 'POST', headers: auth, label: LABEL, fetchImpl, signal,
        body: { class_method: 'async_create_session', input: { user_id: userId } },
      });
      session = made?.output?.id || null;
    }
    const stream = await vendorFetch({
      url: `${url}:streamQuery?alt=sse`, method: 'POST', headers: auth, label: LABEL, fetchImpl, signal,
      accept: 'text/event-stream', timeoutMs: TURN_LIMIT_MS,
      body: { class_method: 'async_stream_query', input: { user_id: userId, ...(session ? { session_id: session } : {}), message: text } },
    });
    const parts = [];
    try {
      await readSse(stream.res, (event) => {
        const words = adkEventText(event);
        if (words) parts.push(words);
        return false;
      }, { label: LABEL, signal });
    } finally {
      stream.done();
    }
    return { text: parts.join('\n\n'), thread: session };
  },
};
