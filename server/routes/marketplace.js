import express from 'express';
import pool from '../db.js';
import {
  getModuleListing,
  installModuleListing,
  listModuleListings,
  marketplacePublicKey,
  previewModuleListing,
  publishModuleListing,
  sellerStatus,
  unlistModuleListing,
} from '../marketplace/moduleListings.js';
import { MAX_MODULE_SOURCE_BYTES, sourceBytes } from '../../src/lib/modules/moduleFormat.js';

// Spec 5b marketplace, module listings ("Copy to your board"). Runs inside
// the censaiOS server, wherever censaiOS runs.
export const marketplaceRouter = express.Router();

function requireUser(req, res) {
  if (req.session?.userId) return req.session.userId;
  res.status(401).json({ error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
  return null;
}

function sendError(res, err, fallbackCode) {
  const status = Number(err?.statusCode) || 500;
  res.status(status).json({
    error: status >= 500 && !err?.code ? 'Marketplace request failed.' : err.message,
    code: err?.code || fallbackCode,
    ...(err?.checks ? { checks: err.checks } : {}),
  });
}

function moduleBody(req) {
  return {
    listingId: req.body?.listingId || null,
    request: typeof req.body?.request === 'string' ? req.body.request : '',
    manifest: req.body?.manifest,
    source: typeof req.body?.source === 'string' ? req.body.source : '',
    summary: typeof req.body?.summary === 'string' ? req.body.summary : '',
  };
}

marketplaceRouter.get('/public-key', async (_req, res) => {
  try { res.json(await marketplacePublicKey(pool)); } catch (err) { sendError(res, err, 'MARKETPLACE_KEY_FAILED'); }
});

marketplaceRouter.get('/seller', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try { res.json(await sellerStatus(pool, userId)); } catch (err) { sendError(res, err, 'MARKETPLACE_SELLER_FAILED'); }
});

// Dry run of the checks, so the Publish sheet can show them before anything is listed.
marketplaceRouter.post('/modules/check', (req, res) => {
  if (!requireUser(req, res)) return;
  const body = moduleBody(req);
  if (sourceBytes(body.source) > MAX_MODULE_SOURCE_BYTES) return res.status(413).json({ error: 'This module is too large to publish.', code: 'MODULE_TOO_LARGE' });
  res.json(previewModuleListing(body));
});

marketplaceRouter.post('/modules', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try { res.json({ listing: await publishModuleListing(pool, userId, moduleBody(req)) }); } catch (err) { sendError(res, err, 'MARKETPLACE_PUBLISH_FAILED'); }
});

marketplaceRouter.get('/modules', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try { res.json({ listings: await listModuleListings(pool, userId) }); } catch (err) { sendError(res, err, 'MARKETPLACE_LIST_FAILED'); }
});

marketplaceRouter.get('/modules/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try { res.json({ listing: await getModuleListing(pool, userId, req.params.id) }); } catch (err) { sendError(res, err, 'MARKETPLACE_LISTING_FAILED'); }
});

marketplaceRouter.post('/modules/:id/install', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try { res.json({ listing: await installModuleListing(pool, userId, req.params.id) }); } catch (err) { sendError(res, err, 'MARKETPLACE_INSTALL_FAILED'); }
});

marketplaceRouter.delete('/modules/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try { res.json({ removed: await unlistModuleListing(pool, userId, req.params.id) }); } catch (err) { sendError(res, err, 'MARKETPLACE_UNLIST_FAILED'); }
});
