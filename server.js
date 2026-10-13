import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { httpMiddleware } from './server/httpTelemetry.js';
import { 
  setupMiddleware, 
  mountRouters, 
  setupProductionServing, 
  startServer as bootStartServer 
} from './server/boot/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Crash evidence: `node --watch` clears the terminal on restart, wiping the
// fatal error with it. Persist fatal process errors synchronously to the
// daily JSONL log so they survive restarts. Skipped under NODE_ENV=test so
// suites that intentionally trigger rejections keep working.
if (process.env.NODE_ENV !== 'test') {
  const crashLogPath = () => {
    try {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      return path.join(__dirname, '.homebase-state', 'logs', `homebase-${day}.jsonl`);
    } catch {
      return null;
    }
  };
  const persistFatal = (kind, err) => {
    try {
      const file = crashLogPath();
      if (!file) return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const record = {
        time: new Date().toISOString(),
        level: 'fatal',
        namespace: 'process',
        message: kind,
        meta: { message: err?.message || String(err), stack: err?.stack || null },
      };
      fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
    } catch {
      // crash logging must never throw
    }
  };
  process.on('uncaughtException', (err) => {
    persistFatal('uncaughtException', err);
    console.error(err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    persistFatal('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
    console.error(reason);
    process.exit(1);
  });
}

// Observe-only request telemetry (powers the `http` section of
// /api/system/status). First so it sees every response, including 404s.
app.use(httpMiddleware);

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
