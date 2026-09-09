import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  setupMiddleware, 
  mountRouters, 
  setupProductionServing, 
  startServer as bootStartServer 
} from './server/boot/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── AI-First Boot Sequence ──────────────────────────────────────────
setupMiddleware(app);
mountRouters(app);
setupProductionServing(app, __dirname);

// ─── Start Server ────────────────────────────────────────────────────
async function startServer(options = {}) {
  return bootStartServer(app, options);
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, startServer };
