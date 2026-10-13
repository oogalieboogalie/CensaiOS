import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { ollamaRouter, ollamaBaseUrl } from '../server/routes/ollama.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/ollama', ollamaRouter);
  return a;
}

afterEach(() => {
  delete global.fetch;
  jest.restoreAllMocks();
});

describe('ollamaBaseUrl', () => {
  const prev = process.env.AI_BASE_URL;
  afterEach(() => {
    if (prev === undefined) delete process.env.AI_BASE_URL;
    else process.env.AI_BASE_URL = prev;
  });

  test('defaults to the local Ollama v1 endpoint', () => {
    delete process.env.AI_BASE_URL;
    expect(ollamaBaseUrl()).toBe('http://localhost:11434/v1');
  });

  test('refuses non-loopback base URLs on both endpoints', async () => {
    process.env.AI_BASE_URL = 'https://api.example.com/v1';
    const a = app();
    const r1 = await request(a).get('/api/ollama/models');
    expect(r1.status).toBe(403);
    expect(r1.body.error).toBe('ollama-base-not-local');
    const r2 = await request(a)
      .post('/api/ollama/chat')
      .send({ model: 'x', messages: [{ role: 'user', content: 'hi' }] });
    expect(r2.status).toBe(403);
  });

  test('accepts the loopback spellings', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200, json: async () => ({ data: [] }) });
    for (const base of ['http://localhost:11434/v1', 'http://127.0.0.1:11434/v1', 'http://[::1]:11434/v1']) {
      process.env.AI_BASE_URL = base;
      const res = await request(app()).get('/api/ollama/models');
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /api/ollama/models', () => {
  test('proxies the model list', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ data: [{ id: 'llama3' }, { id: 'mistral' }] }),
    });
    const res = await request(app()).get('/api/ollama/models');
    expect(res.status).toBe(200);
    expect(res.body.models).toEqual(['llama3', 'mistral']);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/models'),
      expect.anything(),
    );
  });

  test('unreachable Ollama returns the 503 contract error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const res = await request(app()).get('/api/ollama/models');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ollama-unreachable');
    expect(typeof res.body.baseUrl).toBe('string');
  });
});

describe('POST /api/ollama/chat', () => {
  test('400s on missing model or empty messages', async () => {
    const a = app();
    const r1 = await request(a).post('/api/ollama/chat').send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(r1.status).toBe(400);
    const r2 = await request(a).post('/api/ollama/chat').send({ model: 'llama3', messages: [] });
    expect(r2.status).toBe(400);
  });

  test('proxies chat completions and returns the reply text', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Hey!' } }] }),
    });
    const res = await request(app())
      .post('/api/ollama/chat')
      .send({ model: 'llama3', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Hey!');
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ model: 'llama3', messages: [{ role: 'user', content: 'hi' }] });
  });

  test('unreachable Ollama on chat returns the 503 contract error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const res = await request(app())
      .post('/api/ollama/chat')
      .send({ model: 'llama3', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ollama-unreachable');
  });
});
