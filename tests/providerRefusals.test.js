// A stand-in AI server answers 404 (missing model), 402 (no credit) and
// Google's 400 API_KEY_INVALID. The first two become one plain sentence.
// The third is tagged as a bad key. Keys never appear in the sentence or the log.
import http from 'node:http';
import { onLogRecord } from '../server/logger.js';
import { requestChatCompletion } from '../server/aiGateway/chatCompletion.js';
import { tagRejectedKey } from '../server/aiGateway/missingKey.js';
import { chatCompletionHttpError } from '../server/aiGateway/retryPolicy.js';
import { publicChatError } from '../server/routes/chat/httpErrors.js';

const FAKE_OPENAI_KEY = 'sk-testkey1234567890';
const FAKE_GOOGLE_KEY = 'AIzaSyTESTNOTAREALKEY000';

const MISSING_MODEL = {
  error: {
    message: 'The model `gpt-9` does not exist',
    type: 'invalid_request_error',
    code: 'model_not_found',
  },
  api_key: FAKE_OPENAI_KEY,
};

const NO_CREDIT = {
  error: {
    message: 'You have no credit left on this account.',
    type: 'insufficient_quota',
    code: 'insufficient_quota',
  },
};

const GOOGLE_BAD_KEY = {
  error: {
    code: 400,
    message: 'API key not valid. Please pass a valid API key.',
    status: 'INVALID_ARGUMENT',
    details: [{
      '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
      reason: 'API_KEY_INVALID',
      domain: 'googleapis.com',
      metadata: { service: 'generativelanguage.googleapis.com' },
    }],
  },
};

function startStandin() {
  let answer = { status: 500, body: { error: { message: 'no scripted answer', type: 'server_error' } } };
  const server = http.createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        reply(status, body) { answer = { status, body }; },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

async function ask(standin, provider, apiKey) {
  try {
    await requestChatCompletion({
      config: { provider, model: 'gpt-9', baseUrl: standin.baseUrl, apiKey },
      body: { messages: [{ role: 'user', content: 'hello from Sam Example' }] },
      timeoutMs: 5000,
      retry: { maxRetries: 0, max429Retries: 0 },
    });
    throw new Error('the stand-in should have refused');
  } catch (error) {
    if (error?.message === 'the stand-in should have refused') throw error;
    return error;
  }
}

describe('provider refusals', () => {
  let standin;
  let warnings;

  beforeAll(async () => {
    standin = await startStandin();
  });

  afterAll(async () => {
    await standin.close();
  });

  beforeEach(() => {
    warnings = [];
  });

  function listen() {
    return onLogRecord((record) => {
      if (record.namespace === 'ai-gateway' && record.message === 'provider turned a message down') {
        warnings.push(record);
      }
    });
  }

  test('a missing model is one plain sentence and names OpenAI', async () => {
    standin.reply(404, MISSING_MODEL);
    const stop = listen();
    const error = await ask(standin, 'openai', FAKE_OPENAI_KEY);
    stop();
    const { body } = publicChatError(error);
    expect(body.message).toBe('OpenAI turned this down: The model gpt-9 does not exist.');
    expect(body.message).not.toContain(FAKE_OPENAI_KEY);
    expect(body.message).not.toMatch(/[{}]|404:/);
    expect(body.code).toBe('CHAT_REQUEST_FAILED');
    expect(tagRejectedKey(error, 'openai').code).toBeUndefined();
    expect(warnings).toEqual([expect.objectContaining({
      level: 'warn',
      meta: { provider: 'openai', status: 404, errorType: 'invalid_request_error' },
    })]);
    expect(JSON.stringify(warnings)).not.toContain(FAKE_OPENAI_KEY);
    expect(JSON.stringify(warnings)).not.toContain('hello from Sam Example');
  });

  test('no credit is one plain sentence', async () => {
    standin.reply(402, NO_CREDIT);
    const stop = listen();
    const error = await ask(standin, 'openai', FAKE_OPENAI_KEY);
    stop();
    expect(publicChatError(error).body.message).toBe('OpenAI turned this down: You have no credit left on this account.');
    expect(warnings[0].meta).toMatchObject({ provider: 'openai', status: 402, errorType: 'insufficient_quota' });
  });

  test('a key inside the provider sentence is hidden', async () => {
    standin.reply(404, {
      error: {
        message: `The model gpt-9 does not exist for ${FAKE_OPENAI_KEY}`,
        type: 'invalid_request_error',
      },
    });
    const error = await ask(standin, 'openai', FAKE_OPENAI_KEY);
    const message = publicChatError(error).body.message;
    expect(message).toBe('OpenAI turned this down: The model gpt-9 does not exist for [hidden].');
    expect(message).not.toContain(FAKE_OPENAI_KEY);
  });

  test("Google's 400 API_KEY_INVALID is a bad key, not a raw error", async () => {
    standin.reply(400, GOOGLE_BAD_KEY);
    const stop = listen();
    const error = await ask(standin, 'google', FAKE_GOOGLE_KEY);
    stop();
    const tagged = tagRejectedKey(error, 'google');
    expect(tagged).toMatchObject({ code: 'MODEL_KEY_REJECTED', statusCode: 400, keyProvider: 'google' });
    const { status, body } = publicChatError(tagged);
    expect(status).toBe(400);
    expect(body).toMatchObject({
      code: 'MODEL_KEY_REJECTED',
      keyProvider: 'google',
      message: 'Google Gemini did not accept the saved key. Paste a working key to send your message.',
    });
    expect(body.message).not.toContain(FAKE_GOOGLE_KEY);
    expect(body.message).not.toMatch(/API_KEY_INVALID|[{]/);
    expect(warnings).toEqual([]);
  });

  test('a rate limit stays the rate-limit sentence', () => {
    const error = chatCompletionHttpError(429, '{"error":{"message":"Rate limit exceeded","type":"rate_limit_error"}}', '2', 'openai');
    expect(error.refusalSentence).toBeUndefined();
    expect(publicChatError(error).body.message).toMatch(/rate-limited/);
  });
});
