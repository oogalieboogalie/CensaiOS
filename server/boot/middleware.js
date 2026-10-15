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
import { doorAllowsOrigin } from '../webOs/door.js';
import { isPlaygroundRead } from './playgroundAssets.js';

const log = createLogger('http');
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:5173';
const QUIET_PATHS = [/^\/api\/health$/, /^\/api\/client-state/, /^\/api\/local-dev-restarts/];

export function setupMiddleware(app) {
  app.set('trust proxy', getProxyTrustSetting());
  const appCors = cors((req, callback) => {
    const origin = req.get('origin');
    // Open anywhere (server/webOs/door.js): only when the owner turns it on,
    // a computer on the home network may open this copy by its own address.
    // Same-address requests only; public names are refused (DNS rebinding).
    if (isAllowedBrowserOrigin(origin, { appOrigin: APP_ORIGIN }) || doorAllowsOrigin(origin, req.get('host'))) {
      callback(null, { origin: true, credentials: true });
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  });
  // Game Playground files load from a sandboxed frame (server/boot/playgroundAssets.js).
  app.use((req, res, next) => (isPlaygroundRead(req) ? next() : appCors(req, res, next)));
  // Chat turns can carry images, PDFs, audio and video (capped at 20 MB raw,
  // ~27 MB as base64); everything else keeps the 10mb default.
  app.use('/api/chat', express.json({ limit: '32mb' }));
  // Stripe signs the exact bytes it sends, so its webhook keeps a raw body.
  app.use('/api/billing/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }));
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
  // WebSocket upgrades verify the same signed cookie, so they must use the
  // secret express-session actually signs with (including the dev fallback).
  app.set('sessionSecret', SESSION_SECRET);

  app.use(session({
    store,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: getSessionCookieOptions(APP_ORIGIN),
  }));
}
