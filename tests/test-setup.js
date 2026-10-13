import request from 'supertest';
import { app, startServer } from '../server.js';

export function createApiClient() {
  return request(app);
}

export async function startTestServer(options = {}) {
  return startServer({
    port: 0,
    startWorkers: false,
    startWatchers: false,
    ...options,
  });
}

export async function stopTestServer(server) {
  if (!server) return;
  if (server.julesWatcherInterval) clearInterval(server.julesWatcherInterval);
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
