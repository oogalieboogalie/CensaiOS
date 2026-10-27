// Gemini 3.8 Flash on the OpenAI-compatible endpoint answers a tool follow-up
// that dropped extra_content.google.thought_signature with HTTP 400 and a
// one-element array body. Reading only object.error.message turned that into
// "It gave no reason." A normal tool round has to keep the signature, and an
// empty blockReason must not hide a finishReason or safety rating.
import http from 'node:http';
import { plainRefusalSentence } from '../server/aiGateway/providerRefusal.js';
import { requestChatCompletion } from '../server/aiGateway/chatCompletion.js';
import { chatCompletionHttpError } from '../server/aiGateway/retryPolicy.js';
import { publicChatError } from '../server/routes/chat/httpErrors.js';
import { createStreamAssembler } from '../server/aiGateway/chatStream.js';

const SIGNATURE = 'sig-live';

// Recorded 2026-10-25 from generativelanguage.googleapis.com for gemini-3.8-flash.
// The tool-result request omitted the thought signature. Key redacted; none was in the body.
const LIVE_TURN_DOWN = JSON.stringify([{
  error: {
    code: 400,
    message: 'Function call is missing a thought_signature in functionCall parts. This is required for tools to work correctly.',
    status: 'INVALID_ARGUMENT',
  },
}]);

function startStandin() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = {}; }
      const assistant = (body.messages || []).find((message) => message?.tool_calls);
      if (!assistant) {
        const chunk = {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'search_tools', arguments: '{"query":"read a file"}' },
                extra_content: { google: { thought_signature: SIGNATURE } },
              }],
            },
          }],
        };
        const done = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`);
        return;
      }
      const signature = assistant.tool_calls?.[0]?.extra_content?.google?.thought_signature;
      if (signature !== SIGNATURE) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(LIVE_TURN_DOWN);
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ index: 0, message: { role: 'assistant', content: 'Found read_file.' }, finish_reason: 'stop' }],
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function ask(standin, messages) {
  return requestChatCompletion({
    config: {
      provider: 'google',
      model: 'gemini-3.8-flash',
      baseUrl: standin.baseUrl,
      apiKey: 'test-gemini-key',
    },
    body: {
      messages,
      tools: [{ type: 'function', function: { name: 'search_tools', parameters: { type: 'object', properties: {} } } }],
    },
    timeoutMs: 5000,
    retry: { maxRetries: 0, max429Retries: 0 },
    onDelta: () => {},
  });
}

describe('Gemini turn-down', () => {
  test('an array error body keeps the provider sentence', () => {
    const error = chatCompletionHttpError(400, LIVE_TURN_DOWN, null, 'google');
    const message = publicChatError(error).body.message;
    expect(message).toBe('Google Gemini turned this down: Function call is missing a thought_signature in functionCall parts.');
    expect(message).not.toMatch(/gave no reason/);
  });

  test('an empty blockReason still reports the finish reason and safety rating', () => {
    const message = plainRefusalSentence('google', {
      error: { code: 400, message: '', status: 'INVALID_ARGUMENT' },
      promptFeedback: { blockReason: '' },
      candidates: [{
        finishReason: 'SAFETY',
        safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', blocked: true, probability: 'HIGH' }],
      }],
    });
    expect(message).toBe('Google Gemini turned this down: Safety filters blocked the reply (HARM_CATEGORY_DANGEROUS_CONTENT).');
    expect(message).not.toMatch(/gave no reason|HIGH/);
  });

  test('a block reason message is the sentence, and a truly empty body still says so', () => {
    expect(plainRefusalSentence('google', {
      promptFeedback: { blockReason: 'OTHER', blockReasonMessage: 'Unsupported language.' },
    })).toBe('Google Gemini turned this down: Unsupported language.');
    expect(plainRefusalSentence('google', {})).toBe('Google Gemini turned this down: It gave no reason.');
  });

  test('a streamed tool call keeps its thought signature for the follow-up', () => {
    const assembler = createStreamAssembler();
    assembler.push({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'search_tools', arguments: '{"q":' },
            extra_content: { google: { thought_signature: SIGNATURE } },
          }],
        },
      }],
    });
    assembler.push({
      choices: [{
        delta: { tool_calls: [{ index: 0, function: { arguments: '"file"}' }, extra_content: { google: {} } }] },
        finish_reason: 'tool_calls',
      }],
    });
    expect(assembler.result().choices[0].message.tool_calls[0].extra_content.google.thought_signature).toBe(SIGNATURE);
  });

  describe('tool follow-up against the recorded turn-down', () => {
    let standin;

    beforeAll(async () => {
      standin = await startStandin();
    });

    afterAll(async () => {
      await standin.close();
    });

    test('a normal tool round is not a no-reason turn-down', async () => {
      const user = { role: 'user', content: 'Find a tool that can read a file.' };
      const first = await ask(standin, [user]);
      const message = first.choices[0].message;
      const calls = message.tool_calls.slice(0, 15);
      expect(calls[0].extra_content.google.thought_signature).toBe(SIGNATURE);

      const second = await ask(standin, [
        user,
        { ...message, tool_calls: calls },
        { role: 'tool', tool_call_id: calls[0].id, content: '{"tools":[{"name":"read_file"}]}' },
      ]);
      expect(second.choices[0].message.content).toBe('Found read_file.');
    });

    test('dropping the signature reports the real reason', async () => {
      const user = { role: 'user', content: 'Find a tool that can read a file.' };
      const first = await ask(standin, [user]);
      const calls = first.choices[0].message.tool_calls.map(({ extra_content, ...rest }) => rest);
      let error;
      try {
        await ask(standin, [
          user,
          { role: 'assistant', content: '', tool_calls: calls },
          { role: 'tool', tool_call_id: calls[0].id, content: '{}' },
        ]);
      } catch (err) {
        error = err;
      }
      const message = publicChatError(error).body.message;
      expect(message).toBe('Google Gemini turned this down: Function call is missing a thought_signature in functionCall parts.');
      expect(message).not.toMatch(/gave no reason/);
    });
  });
});
