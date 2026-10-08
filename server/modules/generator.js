// Spec 6 generator: plain-language request in, { manifest, source } out.
// Runs on the caller's model access (their key, or the workspace's), streams
// the reply when the caller wants deltas, and gives the model one retry with
// the error when the reply isn't a usable module.

import { callModel, createModelAccessContext, resolveChatModelConfig } from '../aiGateway/index.js';
import {
  MAX_MODULE_SOURCE_BYTES,
  parseModuleReply,
  sourceBytes,
} from '../../src/lib/modules/moduleFormat.js';
import { buildEditMessages, buildGenerateMessages } from './prompt.js';

export const GENERATE_TIMEOUT_MS = 120000;
const MAX_ATTEMPTS = 2;

function moduleError(message, code, statusCode = 422) {
  return Object.assign(new Error(message), { code, statusCode });
}

/** Why a parsed reply can't run, or null when it can. */
export function checkModule(parsed) {
  if (!parsed.complete || !parsed.source) return 'The reply did not contain a closed ```html block with the module.';
  if (sourceBytes(parsed.source) > MAX_MODULE_SOURCE_BYTES) return `The module is larger than ${MAX_MODULE_SOURCE_BYTES / 1024} KB. Make it smaller.`;
  if (/<script[^>]+\bsrc\s*=/i.test(parsed.source)) return 'External scripts are blocked in the sandbox. Inline all JavaScript.';
  if (/<link[^>]+stylesheet/i.test(parsed.source)) return 'External stylesheets are blocked in the sandbox. Inline all CSS.';
  if (/^\s*import\s.+from\s/m.test(parsed.source)) return 'Imports are not available. Use plain JavaScript with the censai global.';
  return null;
}

export async function generateModule({
  userId,
  workspaceId,
  request = '',
  instruction = '',
  source = '',
  sketch = '',
  manifest = null,
  modelProvider = null,
  modelName = null,
  config = null,
  onDelta = null,
} = {}) {
  const isEdit = Boolean(instruction);
  const current = String(source || '');
  if (!isEdit && !String(request).trim()) throw moduleError('Say what the module should do.', 'MODULE_REQUEST_REQUIRED', 400);
  if (isEdit && !current.trim()) throw moduleError('There is no module to change yet.', 'MODULE_SOURCE_REQUIRED', 400);

  const resolved = config || resolveChatModelConfig({ modelProvider, modelName });
  const accessContext = createModelAccessContext({ userId, workspaceId, source: isEdit ? 'module-edit' : 'module-generate' });
  const messages = isEdit
    ? await buildEditMessages({ request, instruction, source: current, manifest })
    : await buildGenerateMessages({ request, sketch });

  let lastProblem = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let streamed = '';
    const completion = await callModel({
      accessContext,
      config: resolved,
      body: { model: resolved.model, temperature: 0.4, messages },
      timeoutMs: GENERATE_TIMEOUT_MS,
      logContext: { source: 'module-generate', attempt },
      onDelta: typeof onDelta === 'function'
        ? (chunk) => { streamed += chunk; onDelta(chunk, { attempt, text: streamed }); }
        : null,
    });
    const reply = completion?.choices?.[0]?.message?.content || streamed;
    const parsed = parseModuleReply(reply, { request: request || manifest?.name || '' });
    lastProblem = checkModule(parsed);
    if (!lastProblem) {
      return {
        manifest: parsed.manifest,
        source: parsed.source,
        model: resolved.model,
        provider: resolved.provider || null,
        attempts: attempt,
      };
    }
    messages.push({ role: 'assistant', content: String(reply).slice(0, 20000) });
    messages.push({ role: 'user', content: `That module can't run: ${lastProblem} Return the corrected manifest and HTML in the same two-block format.` });
  }
  throw moduleError(`The model did not return a working module (${lastProblem})`, 'MODULE_GENERATION_FAILED', 502);
}
