// Stand-in for an OpenAI-compatible /chat/completions endpoint (Gemini's,
// OpenAI's, OpenRouter's). Streams `words` one SSE chunk at a time with
// `delayMs` between them, so a test (or a screenshot) sees a real race.
// `respond(body)` returns { words, delayMs, firstDelayMs, usage } or
// { status, error }.
import http from 'node:http';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startOpenAiStandin(respond) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', async () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* keep empty */ }
      requests.push({ url: req.url, headers: req.headers, body });
      const reply = respond(body, requests.length) || {};
      if (reply.status) {
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: reply.error || 'bad request' } }));
        return;
      }
      const words = reply.words || ['Hello', ' there.'];
      const chunk = (data) => res.write(`data: ${JSON.stringify({ id: 'standin', model: body.model, ...data })}\n\n`);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      await wait(reply.firstDelayMs ?? 0);
      for (const [i, word] of words.entries()) {
        if (i) await wait(reply.delayMs ?? 0);
        chunk({ choices: [{ index: 0, delta: { content: word } }] });
      }
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], ...(reply.usage ? { usage: reply.usage } : {}) });
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
