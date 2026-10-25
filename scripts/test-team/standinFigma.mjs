// A stand-in Figma REST API for the test team: the made-up "Landing Page"
// file from tests/fixtures/figmaApi.js served over HTTP, so a Figma import
// can be tried with no Figma account. Point FIGMA_API_BASE at `url`.

import http from 'node:http';
import { createFigmaFetch } from '../../tests/fixtures/figmaApi.js';

export const STANDIN_FIGMA_TOKEN = 'figd_made_up_pat_token';

/** Starts the stand-in on a free port; resolves with { url, calls(), close() }. */
export function startStandinFigma() {
  const { fetchImpl, calls } = createFigmaFetch({ token: STANDIN_FIGMA_TOKEN });
  const server = http.createServer(async (req, res) => {
    const token = req.headers['x-figma-token'];
    const answer = await fetchImpl(`http://127.0.0.1${req.url}`, { headers: token ? { 'X-Figma-Token': token } : {} });
    res.writeHead(answer.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(await answer.json()));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}/v1`,
      calls: () => calls.length,
      close: () => new Promise((done) => server.close(() => done())),
    }));
  });
}
