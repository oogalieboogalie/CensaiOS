import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import session from 'express-session';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import {
  optionalSecret,
  requireProductionSecret,
} from '../secrets.js';
import { getSessionCookieOptions } from './sessionConfig.js';
import {
  getProxyTrustSetting,
  isAllowedBrowserOrigin,
} from '../security/httpBoundary.js';
import { PostgresSessionStore } from '../security/postgresSessionStore.js';
import { createCsrfOriginGuard } from '../middleware/csrfOriginGuard.js';

const log = createLogger('http');
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:5173';
const QUIET_PATHS = [/^\/api\/health$/, /^\/api\/client-state/, /^\/api\/local-dev-restarts/];

export function setupMiddleware(app) {
  app.set('trust proxy', getProxyTrustSetting());
  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedBrowserOrigin(origin, { appOrigin: APP_ORIGIN })) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(createCsrfOriginGuard({ appOrigin: APP_ORIGIN }));

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const quiet = QUIET_PATHS.some((re) => re.test(req.path));
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : (quiet ? 'debug' : 'info');
      log[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    });
    next();
  });

  const SESSION_SECRET = requireProductionSecret('SESSION_SECRET')
    || optionalSecret('SESSION_SECRET')
    || crypto.randomBytes(32).toString('hex');

  // Jest creates an isolated module graph for every suite. Starting production
  // maintenance in each graph leaves timers and cleanup queries alive until the
  // shared pool is closed, which both races teardown and retains the graph.
  const store = new PostgresSessionStore(pool, process.env.NODE_ENV === 'test'
    ? { cleanupIntervalMs: 0, cleanupOnStart: false }
    : undefined);

  app.set('sessionStore', store);

  app.use(session({
    store,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: getSessionCookieOptions(APP_ORIGIN),
  }));
}
