// Atlas sends its whole tool list with every message, so a tool shape Gemini
// refuses fails every message, short or long, while Claude takes the same
// list. A stand-in Gemini endpoint applies the Schema rules Gemini documents
// (one type per field, only its own keywords) and answers a refusal the way
// the live endpoint does: HTTP 400 with a one-element array body. Made-up key.
import http from 'node:http';
import { requestChatCompletion } from '../server/aiGateway/chatCompletion.js';
import { geminiSchema, prepareGeminiToolPayload } from '../server/aiGateway/geminiTools.js';
import { publicChatError } from '../server/routes/chat/httpErrors.js';
import { heldBackReplyText } from '../server/routes/chat/reasoningFallback.js';

const { TOOL_DEFINITIONS } = await import('../server/tools/definitions.js');

const GEMINI_KEYWORDS = new Set([
  'type', 'format', 'title', 'description', 'nullable', 'enum', 'default', 'example',
  'items', 'minItems', 'maxItems', 'properties', 'required', 'minProperties', 'maxProperties',
  'propertyOrdering', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'anyOf',
]);

function schemaProblem(schema, at) {
  if (!schema || typeof schema !== 'object') return null;
  for (const key of Object.keys(schema)) {
    if (!GEMINI_KEYWORDS.has(key)) return `Invalid JSON payload received. Unknown name "${key}" at '${at}': Cannot find field.`;
  }
  if (Array.isArray(schema.type)) return `Invalid JSON payload received. Proto field is not repeating, cannot start list at '${at}.type'.`;
  for (const [name, child] of Object.entries(schema.properties || {})) {
    const found = schemaProblem(child, `${at}.properties[${name}].value`);
    if (found) return found;
  }
  return schemaProblem(schema.items, `${at}.items`);
}

function requestProblem(body) {
  for (const [i, tool] of (body.tools || []).entries()) {
    const params = tool.function?.parameters;
    const at = `tools[${i}].function_declarations[0].parameters`;
    if (params && params.type === 'object' && !Object.keys(params.properties || {}).length) {
      return `* GenerateContentRequest.${at}.properties: should be non-empty for OBJECT type`;
    }
    const found = schemaProblem(params, at);
    if (found) return found;
  }
  return null;
}

const REFUSALS = {
  'gemini-no-access': [403, 'PERMISSION_DENIED', 'Your API key does not have access to this model.'],
  'gemini-gone': [404, 'NOT_FOUND', 'models/gemini-gone is not found for API version v1beta.'],
};

function startStandin() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const refusal = REFUSALS[body.model];
      const problem = requestProblem(body);
      if (refusal || problem) {
        const [code, status, message] = refusal || [400, 'INVALID_ARGUMENT', problem];
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify([{ error: { code, message, status } }]));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'Hi.' }, finish_reason: 'stop' }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  })));
}

// A tool brought in from outside (an MCP server) in the shapes Gemini refuses.
const OUTSIDE_TOOL = {
  type: 'function',
  function: {
    name: 'outside_lookup',
    description: 'Made-up outside tool',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: ['string', 'null'], description: 'Which one' },
        mode: { const: 'fast' },
        size: { type: 'integer', enum: [1, 2, 3] },
      },
      required: ['id', 'gone'],
    },
  },
};

let standin;
beforeAll(async () => { standin = await startStandin(); });
afterAll(async () => { await standin.close(); });

function ask({ tools, model = 'gemini-3.8-flash', provider = 'google' }) {
  return requestChatCompletion({
    config: { provider, model, baseUrl: standin.baseUrl, apiKey: 'made-up-gemini-key' },
    body: { messages: [{ role: 'user', content: 'hi' }], tools },
    timeoutMs: 5000,
    retry: { maxRetries: 0, max429Retries: 0 },
  });
}

async function refusalLine(promise) {
  try {
    await promise;
  } catch (err) {
    return publicChatError(err).body.message;
  }
  throw new Error('expected a refusal');
}

describe("Atlas's request shape reaches Gemini", () => {
  test('every built-in tool plus an outside tool is accepted on a one-word message', async () => {
    const tools = [...TOOL_DEFINITIONS, OUTSIDE_TOOL];
    const data = await ask({ tools });
    expect(data.choices[0].message.content).toBe('Hi.');
  });

  test('without the rewrite the same list is refused, and the chat names why', async () => {
    const line = await refusalLine(ask({ provider: 'openai', tools: [...TOOL_DEFINITIONS, OUTSIDE_TOOL] }));
    expect(line).toMatch(/should be non-empty for OBJECT type|Unknown name|not repeating/);
    expect(line).not.toMatch(/gave no reason/i);
  });

  test('a request with no tools, and the written tool itself, are left as they are', () => {
    const payload = { messages: [] };
    expect(prepareGeminiToolPayload(payload)).toBe(payload);
    prepareGeminiToolPayload({ tools: [OUTSIDE_TOOL] });
    expect(OUTSIDE_TOOL.function.parameters.additionalProperties).toBe(false);
  });

  test('the rewrite keeps meaning: one type plus nullable, required only for kept fields', () => {
    const out = geminiSchema(OUTSIDE_TOOL.function.parameters);
    expect(out.properties.id).toEqual({ type: 'string', nullable: true, description: 'Which one' });
    expect(out.properties.size).toEqual({ type: 'string', enum: ['1', '2', '3'] });
    expect(out.required).toEqual(['id']);
    expect(out).not.toHaveProperty('additionalProperties');
    expect(out).not.toHaveProperty('$schema');
  });

  test('a tool that takes nothing is sent with no parameters', () => {
    const [tool] = prepareGeminiToolPayload({
      tools: [{ type: 'function', function: { name: 'list_projects', parameters: { type: 'object', properties: {} } } }],
    }).tools;
    expect(tool.function).toEqual({ name: 'list_projects' });
  });
});

describe('each kind of Gemini refusal names its reason in the chat', () => {
  test.each([
    ['gemini-no-access', 'Google Gemini turned this down: Your API key does not have access to this model.'],
    ['gemini-gone', 'Google Gemini turned this down: models/gemini-gone is not found for API version v1beta.'],
  ])('%s', async (model, expected) => {
    expect(await refusalLine(ask({ model, tools: [] }))).toBe(expected);
  });

  test.each([
    ['content_filter', 'The model held back its reply: Safety filters blocked the reply.'],
    ['SAFETY', 'The model held back its reply: Safety filters blocked the reply.'],
    ['RECITATION', 'The model held back its reply: The reply was blocked as a recitation.'],
    ['MAX_TOKENS', 'The model held back its reply: It hit its length limit before writing anything.'],
  ])('an empty reply that finished with %s says so', (reason, expected) => {
    expect(heldBackReplyText({ finish_reason: reason, message: { content: '' } })).toBe(expected);
  });

  test('a plain stop is not called held back', () => {
    expect(heldBackReplyText({ finish_reason: 'stop' })).toBe('');
  });
});
