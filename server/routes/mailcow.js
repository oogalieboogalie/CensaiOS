// ─── Mailcow REST Proxy Route ────────────────────────────────────────────────
// Mounts at /api/mailcow — proxies to the local mailcow-dockerized instance.
// The frontend Mailcow Window talks to these endpoints; they never expose
// the raw MAILCOW_API_KEY to the browser.
//
// Everything here uses the server's own Mailcow key, so the mail lists and
// every change are for this computer's owner only. The health check stays
// open to anyone signed in, but only says whether Mailcow is set up. The
// 'mailcow' log says what was tried and whether it worked, never an address,
// a domain name or the key.

import { Router } from 'express';
import { mailcowGet, mailcowPost, mailcowConfigured, getMailcowBaseUrl } from '../mailcow.js';
import { assertSystemAdmin, requireSystemAdmin } from '../security/systemAdmin.js';
import { createLogger } from '../logger.js';

const log = createLogger('mailcow');

export const mailcowRouter = Router();

function userIdOf(req) {
  const id = Number(req.session?.userId);
  return Number.isInteger(id) && id > 0 ? id : 'none';
}

/** requireSystemAdmin, plus a 'mailcow' line when someone is turned away. */
export async function mailcowOwnerOnly(req, res, next) {
  let passed = false;
  await requireSystemAdmin(req, res, () => { passed = true; });
  if (!passed) {
    log.info(`refused ${req.method} /api/mailcow${req.path} for user ${userIdOf(req)}: owner only`);
    return undefined;
  }
  return next();
}

async function isOwner(req) {
  try {
    await assertSystemAdmin(req);
    return true;
  } catch {
    return false;
  }
}

// ── Health / config check ─────────────────────────────────────────────────────
mailcowRouter.get('/health', async (req, res) => {
  if (!mailcowConfigured()) {
    return res.json({
      configured: false,
      message: 'Set MAILCOW_URL and MAILCOW_API_KEY in .env to enable the mailcow addon.',
    });
  }
  if (!(await isOwner(req))) return res.json({ configured: true, ownerOnly: true });
  try {
    const [domains, mailboxes] = await Promise.all([
      mailcowGet('/get/domain/all'),
      mailcowGet('/get/mailbox/all'),
    ]);
    res.json({
      configured: true,
      baseUrl: getMailcowBaseUrl(),
      domainCount: Array.isArray(domains) ? domains.length : 0,
      mailboxCount: Array.isArray(mailboxes) ? mailboxes.length : 0,
      ok: true,
    });
  } catch (err) {
    res.status(502).json({ configured: true, ok: false, error: err.message });
  }
});

/** A list straight from Mailcow, owner only. */
function list(path, mailcowPath) {
  mailcowRouter.get(path, mailcowOwnerOnly, async (_req, res) => {
    try {
      res.json(await mailcowGet(mailcowPath));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
}

/** A change, owner only, with one 'mailcow' log line saying how it went. */
function change(method, path, mailcowPath, what, bodyOf = (req) => req.body) {
  mailcowRouter[method](path, mailcowOwnerOnly, async (req, res) => {
    try {
      const data = await mailcowPost(mailcowPath, bodyOf(req));
      const list = Array.isArray(data) ? data : [data];
      const failed = list.some((r) => r?.type === 'error');
      log.info(`${what} for user ${userIdOf(req)}: ${failed ? 'Mailcow said no' : 'worked'}`);
      res.json(data);
    } catch (err) {
      log.warn(`${what} for user ${userIdOf(req)}: Mailcow could not be reached or answered with an error`);
      res.status(502).json({ error: err.message });
    }
  });
}

// ── Domains ───────────────────────────────────────────────────────────────────
list('/domains', '/get/domain/all');
change('post', '/domains', '/add/domain', 'add a mail domain');
change('delete', '/domains', '/delete/domain', 'delete a mail domain');

// ── Mailboxes ─────────────────────────────────────────────────────────────────
list('/mailboxes', '/get/mailbox/all');
change('post', '/mailboxes', '/add/mailbox', 'add a mailbox');
change('delete', '/mailboxes', '/delete/mailbox', 'delete a mailbox');

// ── Aliases ───────────────────────────────────────────────────────────────────
list('/aliases', '/get/alias/all');
change('post', '/aliases', '/add/alias', 'add an alias');
change('delete', '/aliases', '/delete/alias', 'delete an alias');

// ── Mail Queue ────────────────────────────────────────────────────────────────
list('/queue', '/get/mailq/all');
change('post', '/queue/flush', '/delete/mailq', 'flush the mail queue', () => ({ items: ['all'] }));
