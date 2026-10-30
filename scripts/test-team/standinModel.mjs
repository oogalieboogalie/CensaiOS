// A stand-in AI model for the test team, so chats can be tried with no real
// key and no network. It speaks the OpenAI chat shape (what Ollama and most
// providers speak) on 127.0.0.1 and gives one short fixed answer, except to
// LeadHound's three prompts, which get the JSON a real model would return,
// to a "Made-up team ask", which uses the agent network tools, to a
// "Made-up terminal ask", which tries the terminal tool, to a "Made-up file
// ask", which reads a file (standinFileAsk.mjs), and to a Step cards
// read-over (standinStepCheck.mjs). A message
// carrying pictures is answered with how many it saw and on which model.

import http from 'node:http';
import { standinComplete } from '../../tests/fixtures/leadHoundStandin.js';
import { teamAskReply } from './standinTeamAsk.mjs';
import { terminalAskReply } from './standinTerminalAsk.mjs';
import { fileAskReply } from './standinFileAsk.mjs';
import { stepCheckReply } from './standinStepCheck.mjs';

export const STANDIN_ANSWER = 'Stand-in answer: heard you.';

const LEADHOUND_PROMPTS = ['You are LeadHound,', 'You qualify sales leads.', 'You are an outbound strategist'];

const pictures = (message) => (Array.isArray(message?.content) ? message.content.filter((p) => p?.type === 'image_url').length : 0);

function replyFor(messages = [], tools = [], model = '') {
  const system = String(messages[0]?.content || '');
  if (LEADHOUND_PROMPTS.some((start) => system.startsWith(start))) return { content: standinComplete(messages) };
  const stepCheck = stepCheckReply(messages);
  if (stepCheck) return stepCheck;
  const seen = pictures(messages.filter((m) => m.role === 'user').pop());
  if (seen) return { content: `Stand-in answer: I see ${seen} picture${seen === 1 ? '' : 's'} (${model}).` };
  return teamAskReply(messages, tools) || terminalAskReply(messages, tools) || fileAskReply(messages, tools) || { content: STANDIN_ANSWER };
}

const asToolCalls = (calls, withIndex) => calls.map((c, index) => ({
  ...(withIndex ? { index } : {}), id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments },
}));

function answer(res, body) {
  const { content = '', toolCalls } = replyFor(body.messages, body.tools, body.model);
  const finish = toolCalls ? 'tool_calls' : 'stop';
  const usage = { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 };
  if (!body.stream) {
    const message = { role: 'assistant', content, ...(toolCalls ? { tool_calls: asToolCalls(toolCalls, false) } : {}) };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: 'standin', object: 'chat.completion', model: body.model, usage,
      choices: [{ index: 0, message, finish_reason: finish }],
    }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  const delta = toolCalls ? { role: 'assistant', tool_calls: asToolCalls(toolCalls, true) } : { role: 'assistant', content };
  send({ id: 'standin', choices: [{ index: 0, delta, finish_reason: null }] });
  send({ id: 'standin', choices: [{ index: 0, delta: {}, finish_reason: finish }], usage });
  res.end('data: [DONE]\n\n');
}

/** Starts the stand-in (port 0 picks a free one); resolves with { port, calls(), recent(), close() }. */
export function startStandinModel(port = 11434) {
  let calls = 0;
  // The last few chat requests, so a check can see what a caller sent (tools, words).
  const recent = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const url = req.url.split('?')[0];
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* not JSON */ }
      if (url.endsWith('/models')) return res.end(JSON.stringify({ object: 'list', data: [{ id: 'standin', object: 'model' }] }));
      if (url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'standin:latest', size: 1000 }] }));
      if (url === '/api/version') return res.end(JSON.stringify({ version: '0.0.0' }));
      if (url.endsWith('/embeddings')) return res.end(JSON.stringify({ data: [{ embedding: Array(768).fill(0.01), index: 0 }] }));
      if (!url.endsWith('/chat/completions')) {
        res.statusCode = 404;
        return res.end('{}');
      }
      calls += 1;
      // Only the key's last four letters, so a check can tell whose key paid.
      const keyEnd = String(req.headers.authorization || '').slice(-4);
      recent.push({ tools: Array.isArray(body.tools) ? body.tools.length : 0, toolChoice: body.tool_choice ?? null, messages: body.messages || [], model: body.model || '', keyEnd });
      if (recent.length > 20) recent.shift();
      return answer(res, body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({
      port: server.address().port,
      calls: () => calls,
      recent: () => [...recent],
      close: () => new Promise((done) => server.close(() => done())),
    }));
  });
}
