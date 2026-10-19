import { jest } from '@jest/globals';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

// Each vendor adapter, against request and answer shapes copied from that
// vendor's docs and official SDKs (2026-10-18). No real vendor is called.

const { getVendor, publicVendors } = await import('../server/hostedAgents/vendors/index.js');
const { adkEventText } = await import('../server/hostedAgents/vendors/google.js');
const { readGoogleCredential, forgetGoogleTokens } = await import('../server/hostedAgents/vendors/googleAuth.js');
const { lastAiText, deploymentUrl } = await import('../server/hostedAgents/vendors/langchain.js');
const { talkOverSocket } = await import('../server/hostedAgents/vendors/elevenlabs.js');
const { assertVendorAddress } = await import('../server/hostedAgents/netGuard.js');

const sse = (events) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A fake fetch that answers by "METHOD path" and records every call. */
function fakeFetch(routes) {
  const calls = [];
  const fn = jest.fn(async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || 'GET'} ${u.pathname}`;
    calls.push({ key, url: String(url), headers: init.headers, body: init.body ? (init.body.startsWith('{') ? JSON.parse(init.body) : init.body) : undefined });
    const answer = routes[key];
    if (!answer) return json({ error: 'nope' }, 404);
    return typeof answer === 'function' ? answer(calls[calls.length - 1]) : answer;
  });
  fn.calls = calls;
  return fn;
}

test('the Import screen gets every vendor without functions or secrets', () => {
  const list = publicVendors();
  expect(list.map((v) => v.id)).toEqual(['anthropic', 'openai', 'google', 'elevenlabs', 'langchain']);
  for (const v of list) {
    expect(v.billedBy).toBeTruthy();
    expect(Object.values(v).some((x) => typeof x === 'function')).toBe(false);
  }
});

describe('Claude Managed Agents', () => {
  const claude = getVendor('anthropic');
  test('needs agent_ and env_ ids', () => {
    expect(() => claude.normalize({ ref: 'wf_1', endpoint: 'env_01ABCDEF' })).toThrow(/agent_/);
    expect(() => claude.normalize({ ref: 'agent_01ABCDEF', endpoint: '' })).toThrow(/env_/);
    expect(claude.normalize({ ref: ' agent_01ABCDEF ', endpoint: 'env_01ABCDEF' })).toMatchObject({ ref: 'agent_01ABCDEF', endpoint: 'env_01ABCDEF' });
  });

  test('new chat: makes a session, opens the stream, sends, reads agent.message until idle', async () => {
    const fetchImpl = fakeFetch({
      'POST /v1/sessions': json({ id: 'sesn_011FAKE', status: 'idle' }),
      'GET /v1/sessions/sesn_011FAKE/events/stream': sse([
        { type: 'session.status_running' },
        { type: 'agent.message', content: [{ type: 'text', text: 'Order #1234 ships Monday.' }] },
        { type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
        { type: 'agent.message', content: [{ type: 'text', text: 'never read' }] },
      ]),
      'POST /v1/sessions/sesn_011FAKE/events': json({ data: [{ id: 'sevt_1', type: 'user.message' }] }),
    });
    const reply = await claude.send({ ref: 'agent_01FAKE', endpoint: 'env_01FAKE', apiKey: 'sk-ant-api-sam', thread: null, text: 'Where is my order?', fetchImpl });
    expect(reply).toEqual({ text: 'Order #1234 ships Monday.', thread: 'sesn_011FAKE' });
    expect(fetchImpl.calls.map((c) => c.key)).toEqual(['POST /v1/sessions', 'GET /v1/sessions/sesn_011FAKE/events/stream', 'POST /v1/sessions/sesn_011FAKE/events']);
    expect(fetchImpl.calls[0].body).toEqual({ agent: 'agent_01FAKE', environment_id: 'env_01FAKE', title: 'censaiOS chat' });
    expect(fetchImpl.calls[0].headers).toMatchObject({ 'x-api-key': 'sk-ant-api-sam', 'anthropic-beta': 'managed-agents-2026-04-01' });
    expect(fetchImpl.calls[2].body.events[0]).toEqual({ type: 'user.message', content: [{ type: 'text', text: 'Where is my order?' }] });
  });

  test('a stop for a tool approval says so plainly', async () => {
    const fetchImpl = fakeFetch({
      'GET /v1/sessions/sesn_2/events/stream': sse([{ type: 'session.status_idle', stop_reason: { type: 'requires_action' } }]),
      'POST /v1/sessions/sesn_2/events': json({ data: [] }),
    });
    await expect(claude.send({ ref: 'agent_01FAKE', endpoint: 'env_01FAKE', apiKey: 'k', thread: 'sesn_2', text: 'hi', fetchImpl }))
      .rejects.toMatchObject({ code: 'HOSTED_AGENT_VENDOR_STOPPED', message: expect.stringMatching(/approval/) });
  });

  test('a refused key never echoes the key', async () => {
    const fetchImpl = fakeFetch({ 'GET /v1/agents/agent_01FAKE': json({ error: { message: 'invalid x-api-key sk-ant-api-sam' } }, 401) });
    const err = await claude.describe({ ref: 'agent_01FAKE', apiKey: 'sk-ant-api-sam', fetchImpl }).catch((e) => e);
    expect(err.code).toBe('HOSTED_AGENT_KEY_REFUSED');
    expect(err.message).not.toContain('sk-ant');
  });
});

describe('OpenAI Agents API', () => {
  const openai = getVendor('openai');
  test('workflow and Assistant ids are explained, not accepted', () => {
    expect(() => openai.normalize({ ref: 'wf_68abc' })).toThrow(/ChatKit/);
    expect(() => openai.normalize({ ref: 'asst_abc' })).toThrow(/shut the Assistants API down/);
  });

  test('new session streams the first answer; a follow-up posts an input event', async () => {
    const fetchImpl = fakeFetch({
      'POST /v1/agents/sessions': sse([
        { type: 'agent.session.created', session_id: 'sess_FAKE' },
        { type: 'agent.session.turn.output_text.delta', delta: 'Hel' },
        { type: 'agent.session.turn.output_text.done', text: 'Hello Pat.', session_id: 'sess_FAKE' },
        { type: 'agent.session.turn.completed', session_id: 'sess_FAKE' },
      ]),
      'GET /v1/agents/sessions/sess_FAKE/events': sse([
        { type: 'agent.session.turn.output_text.done', text: 'Second answer.' },
        { type: 'agent.session.idle' },
      ]),
      'POST /v1/agents/sessions/sess_FAKE/events': new Response(null, { status: 202 }),
    });
    const first = await openai.send({ ref: 'agent_fake', apiKey: 'sk-pat', thread: null, text: 'Hi', fetchImpl });
    expect(first).toEqual({ text: 'Hello Pat.', thread: 'sess_FAKE' });
    expect(fetchImpl.calls[0].body).toEqual({ agent_id: 'agent_fake', environment: { type: 'none' }, input: 'Hi', stream: true });
    expect(fetchImpl.calls[0].headers).toMatchObject({ 'OpenAI-Beta': 'agents=v1', Authorization: 'Bearer sk-pat' });
    const second = await openai.send({ ref: 'agent_fake', apiKey: 'sk-pat', thread: 'sess_FAKE', text: 'More', fetchImpl });
    expect(second.text).toBe('Second answer.');
    expect(fetchImpl.calls[2].body.events[0].type).toBe('agent.session.input.message');
  });
});

describe('Google Agent Engine', () => {
  const google = getVendor('google');
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const serviceAccount = JSON.stringify({ type: 'service_account', project_id: 'jordans-shop', client_email: 'agents@jordans-shop.iam.gserviceaccount.com', private_key: privateKey });
  afterEach(() => forgetGoogleTokens());

  test('resource names, console links and express ids', () => {
    const full = google.normalize({ ref: 'https://console.cloud.google.com/x/projects/jordans-shop/locations/us-central1/reasoningEngines/1234567890?y=1' });
    expect(full).toMatchObject({ ref: 'projects/jordans-shop/locations/us-central1/reasoningEngines/1234567890', settings: { location: 'us-central1' } });
    expect(google.normalize({ ref: '1234567890' }).settings.project).toBeNull();
    expect(() => google.normalize({ ref: 'my agent' })).toThrow(/resource name/);
    expect(() => readGoogleCredential('hello')).toThrow(/service account/);
    expect(readGoogleCredential('AIzaSyFAKEFAKEFAKEFAKEFAKE00').kind).toBe('apiKey');
  });

  test('service account: signs in, makes a session, streams ADK events', async () => {
    const fetchImpl = fakeFetch({
      'POST /token': (call) => {
        expect(call.body).toMatch(/grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
        return json({ access_token: 'ya29.fake', expires_in: 3599 });
      },
      'POST /v1/projects/jordans-shop/locations/us-central1/reasoningEngines/123:query': json({ output: { id: 'session-9', userId: 'censai-7' } }),
      'POST /v1/projects/jordans-shop/locations/us-central1/reasoningEngines/123:streamQuery': sse([
        { author: 'root_agent', content: { role: 'model', parts: [{ function_call: { name: 'lookup' } }] } },
        { author: 'root_agent', content: { role: 'model', parts: [{ text: 'Open 9 to 5.' }] } },
      ]),
    });
    const target = google.normalize({ ref: 'projects/jordans-shop/locations/us-central1/reasoningEngines/123' });
    const reply = await google.send({ ...target, apiKey: serviceAccount, thread: null, text: 'Hours?', person: 'censai-7', fetchImpl });
    expect(reply).toEqual({ text: 'Open 9 to 5.', thread: 'session-9' });
    expect(fetchImpl.calls[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(fetchImpl.calls[1].url).toBe('https://us-central1-aiplatform.googleapis.com/v1/projects/jordans-shop/locations/us-central1/reasoningEngines/123:query');
    expect(fetchImpl.calls[2].body).toEqual({ class_method: 'async_stream_query', input: { user_id: 'censai-7', session_id: 'session-9', message: 'Hours?' } });
    expect(fetchImpl.calls[2].headers.Authorization).toBe('Bearer ya29.fake');
  });

  test('ADK event text skips partial chunks, thoughts and the person', () => {
    expect(adkEventText({ partial: true, content: { role: 'model', parts: [{ text: 'x' }] } })).toBe('');
    expect(adkEventText({ content: { role: 'user', parts: [{ text: 'x' }] } })).toBe('');
    expect(adkEventText({ content: { role: 'model', parts: [{ text: 'hm', thought: true }, { text: 'ok' }] } })).toBe('ok');
  });
});

class FakeSocket extends EventEmitter {
  static last = null;
  constructor(url) { super(); this.url = url; this.sent = []; FakeSocket.last = this; setImmediate(() => this.emit('open')); }
  send(raw) {
    const msg = JSON.parse(raw);
    this.sent.push(msg);
    if (msg.type === 'conversation_initiation_client_data') {
      setImmediate(() => {
        this.emit('message', JSON.stringify({ type: 'ping', ping_event: { event_id: 3, ping_ms: 10 } }));
        this.emit('message', JSON.stringify({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { conversation_id: 'conv_FAKE' } }));
      });
    }
    if (msg.type === 'user_message') setImmediate(() => this.emit('message', JSON.stringify({ type: 'agent_response', agent_response_event: { agent_response: `You said ${msg.text}` } })));
  }
  close() { this.closed = true; }
}

describe('ElevenLabs Agents', () => {
  const eleven = getVendor('elevenlabs');
  test('text chat over the signed WebSocket, with the recent chat as context', async () => {
    const fetchImpl = fakeFetch({ 'GET /v1/convai/conversation/get-signed-url': json({ signed_url: 'wss://example.test/v1/convai/conversation?token=x' }) });
    const reply = await eleven.send({
      ref: 'agent_fake01', apiKey: 'xi-sam', text: 'Book Tuesday', fetchImpl, WebSocketImpl: FakeSocket,
      history: [{ who: 'person', text: 'Hi' }, { who: 'agent', text: 'Hello' }],
    });
    expect(reply).toEqual({ text: 'You said Book Tuesday', thread: 'conv_FAKE' });
    expect(fetchImpl.calls[0].headers['xi-api-key']).toBe('xi-sam');
    expect(FakeSocket.last.sent.map((m) => m.type)).toEqual(['conversation_initiation_client_data', 'pong', 'contextual_update', 'user_message']);
    expect(FakeSocket.last.sent[0].conversation_config_override).toEqual({ conversation: { text_only: true } });
    expect(FakeSocket.last.sent[1].event_id).toBe(3);
    expect(FakeSocket.last.sent[2].text).toMatch(/Person: Hi\nYou: Hello/);
  });

  test('a greeting from the agent is never taken for the answer', async () => {
    class Greeter extends FakeSocket {
      send(raw) {
        const msg = JSON.parse(raw);
        if (msg.type === 'conversation_initiation_client_data') {
          this.sent.push(msg);
          setImmediate(() => {
            this.emit('message', JSON.stringify({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { conversation_id: 'c2' } }));
            this.emit('message', JSON.stringify({ type: 'agent_response', agent_response_event: { agent_response: 'Hi, thanks for calling!' } }));
          });
          return;
        }
        super.send(raw);
      }
    }
    const reply = await talkOverSocket({ url: 'wss://x', text: 'Open Sunday?', WebSocketImpl: Greeter, greetingWaitMs: 5000 });
    expect(reply.text).toBe('You said Open Sunday?');
  });

  test('create makes the agent on the account', async () => {
    const fetchImpl = fakeFetch({ 'POST /v1/convai/agents/create': json({ agent_id: 'agent_new01' }) });
    const made = await eleven.create({ name: 'Front desk', voiceId: '', firstMessage: 'Hi!', instructions: 'Be kind.', apiKey: 'xi-sam', fetchImpl });
    expect(made.ref).toBe('agent_new01');
    expect(fetchImpl.calls[0].body).toEqual({ name: 'Front desk', conversation_config: { agent: { first_message: 'Hi!', language: 'en', prompt: { prompt: 'Be kind.' } } } });
  });
});

describe('LangChain deployments', () => {
  const lc = getVendor('langchain');
  test('https deployments only (http for a dev server on this computer, desktop app only)', async () => {
    expect(deploymentUrl('https://shop.us.langgraph.app/')).toBe('https://shop.us.langgraph.app');
    // The shape is fine, but only a run that may reach this computer sends to it (hostedAgentsNetGuard.test.js).
    expect(deploymentUrl('http://127.0.0.1:2024')).toBe('http://127.0.0.1:2024');
    await expect(assertVendorAddress('http://127.0.0.1:2024', { local: false })).rejects.toMatchObject({ code: 'HOSTED_AGENT_PRIVATE_ADDRESS' });
    await expect(assertVendorAddress('http://127.0.0.1:2024', { local: true })).resolves.toBeInstanceOf(URL);
    expect(() => deploymentUrl('http://example.com')).toThrow(/https/);
    expect(() => deploymentUrl('https://a:b@example.com')).toThrow(/password/);
  });

  test('makes a thread, waits for the run, reads the last AI message', async () => {
    const fetchImpl = fakeFetch({
      'POST /threads': json({ thread_id: 'thr-1' }),
      'POST /threads/thr-1/runs/wait': json({ messages: [
        { content: 'how are you?', type: 'human' },
        { content: [{ type: 'text', text: "I'm doing well." }], type: 'ai', tool_calls: [] },
      ] }),
    });
    const target = lc.normalize({ ref: '', endpoint: 'https://shop.us.langgraph.app' });
    expect(target.ref).toBe('agent');
    const reply = await lc.send({ ...target, apiKey: 'lsv2_fake', thread: null, text: 'how are you?', fetchImpl });
    expect(reply).toEqual({ text: "I'm doing well.", thread: 'thr-1' });
    expect(fetchImpl.calls[1].body).toEqual({ assistant_id: 'agent', input: { messages: [{ role: 'user', content: 'how are you?' }] } });
    expect(fetchImpl.calls[1].headers['X-Api-Key']).toBe('lsv2_fake');
    expect(lastAiText({ values: { messages: [{ type: 'ai', content: 'x' }] } })).toBe('x');
  });
});
