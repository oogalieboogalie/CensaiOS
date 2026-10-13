import express from 'express';
import { resourceRateLimiter } from '../middleware/standardRateLimits.js';

// User-facing local-model proxy (Ollama canvas node). Deliberately NOT routed
// through the AI gateway: no gateway Ollama path exists and the June brief
// scopes gateway work out. Talks OpenAI-compatible endpoints on the local
// Ollama base URL (AI_BASE_URL, default http://localhost:11434/v1).
export const ollamaRouter = express.Router();
ollamaRouter.use(resourceRateLimiter);

export function ollamaBaseUrl() {
  const raw = (process.env.AI_BASE_URL || '').trim();
  return raw || 'http://localhost:11434/v1';
}

// Gateway integrity: this proxy exists for the user's OWN local Ollama.
// Anything non-loopback could route metered cloud calls around the AI
// gateway, so refuse it loudly instead of proxying it.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function requireLocalBaseUrl(res) {
  const baseUrl = ollamaBaseUrl();
  let host = '';
  try {
    // URL keeps IPv6 brackets on hostname — strip them before comparing.
    host = new URL(baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    host = '';
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    res.status(403).json({ error: 'ollama-base-not-local', baseUrl });
    return null;
  }
  return baseUrl;
}

function unreachable(res, baseUrl) {
  return res.status(503).json({ error: 'ollama-unreachable', baseUrl });
}

async function proxyJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

ollamaRouter.get('/models', async (req, res) => {
  const baseUrl = requireLocalBaseUrl(res);
  if (!baseUrl) return;
  try {
    const { status, data } = await proxyJson(`${baseUrl}/models`);
    if (status >= 500) return unreachable(res, baseUrl);
    const models = Array.isArray(data?.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
    res.json({ baseUrl, models });
  } catch (err) {
    unreachable(res, baseUrl);
  }
});

ollamaRouter.post('/chat', async (req, res) => {
  const baseUrl = requireLocalBaseUrl(res);
  if (!baseUrl) return;
  const { model, messages } = req.body || {};
  if (typeof model !== 'string' || !model.trim()) {
    return res.status(400).json({ error: 'model is required' });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }
  try {
    const { status, data } = await proxyJson(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages }),
    });
    if (status === 503 || status >= 500) return unreachable(res, baseUrl);
    if (status >= 400) return res.status(status).json({ error: data?.error || 'ollama request failed', baseUrl });
    const text = data?.choices?.[0]?.message?.content ?? '';
    res.json({ baseUrl, model, text, raw: data });
  } catch (err) {
    unreachable(res, baseUrl);
  }
});
