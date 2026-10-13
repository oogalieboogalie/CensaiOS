// Stand-in for the Anthropic Messages API (POST /v1/messages, streaming).
// No real Claude key in CI, so tests point the native provider here. Each
// request is recorded; the reply comes from `respond(body)`, which returns
// { blocks, stop_reason, usage } or { status, error } for an HTTP error.
import http from 'node:http';

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`;
}

function streamEvents({ model, blocks = [], stop_reason = 'end_turn', usage = {}, delayMs = 0 }) {
  const out = [sse('message_start', {
    message: {
      id: 'msg_standin', type: 'message', role: 'assistant', model, content: [],
      stop_reason: null, stop_sequence: null,
      usage: { input_tokens: usage.input_tokens ?? 10, output_tokens: 1, cache_read_input_tokens: usage.cache_read_input_tokens ?? 0, cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0 },
    },
  })];
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      out.push(sse('content_block_start', { index, content_block: { type: 'text', text: '' } }));
      // Split the text so the client has to stitch deltas together.
      // With a delay (screenshots), it streams word by word instead.
      const mid = Math.ceil(block.text.length / 2);
      const parts = delayMs ? block.text.match(/\S+\s*/g) || [] : [block.text.slice(0, mid), block.text.slice(mid)];
      parts.filter(Boolean).forEach((text) => {
        out.push(sse('content_block_delta', { index, delta: { type: 'text_delta', text } }));
      });
    } else if (block.type === 'tool_use') {
      out.push(sse('content_block_start', { index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } }));
      const json = JSON.stringify(block.input);
      const mid = Math.ceil(json.length / 2);
      [json.slice(0, mid), json.slice(mid)].forEach((partial_json) => {
        out.push(sse('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json } }));
      });
    } else if (block.type === 'thinking') {
      out.push(sse('content_block_start', { index, content_block: { type: 'thinking', thinking: '', signature: '' } }));
      out.push(sse('content_block_delta', { index, delta: { type: 'signature_delta', signature: block.signature } }));
    }
    out.push(sse('content_block_stop', { index }));
  });
  out.push(sse('message_delta', { delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: usage.output_tokens ?? 20 } }));
  out.push(sse('message_stop', {}));
  return out;
}

export async function startAnthropicStandin(respond) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', async () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* keep empty */ }
      requests.push({ url: req.url, headers: req.headers, body });
      if (!req.url.startsWith('/v1/messages')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end('{}');
        return;
      }
      const reply = respond(body, requests.length) || {};
      if (reply.status) {
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: reply.error || 'bad request' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      // firstDelayMs / delayMs slow the stream down so a race is visible.
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      if (reply.firstDelayMs) await wait(reply.firstDelayMs);
      for (const chunk of streamEvents({ model: body.model, ...reply })) {
        res.write(chunk);
        if (reply.delayMs && chunk.includes('text_delta')) await wait(reply.delayMs);
      }
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
