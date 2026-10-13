// ─── Mailcow REST Proxy Route ────────────────────────────────────────────────
// Mounts at /api/mailcow — proxies to the local mailcow-dockerized instance.
// The frontend Mailcow Window talks to these endpoints; they never expose
// the raw MAILCOW_API_KEY to the browser.

import { Router } from 'express';
import { mailcowGet, mailcowPost, mailcowConfigured, getMailcowBaseUrl } from '../mailcow.js';

export const mailcowRouter = Router();

// ── Health / config check ─────────────────────────────────────────────────────
mailcowRouter.get('/health', async (_req, res) => {
  if (!mailcowConfigured()) {
    return res.json({
      configured: false,
      message: 'Set MAILCOW_URL and MAILCOW_API_KEY in .env to enable the mailcow addon.',
    });
  }
  try {
    const [domains, mailboxes] = await Promise.all([
      mailcowGet('/get/domain/all'),
      mailcowGet('/get/mailbox/all'),
    ]);
    const domainCount = Array.isArray(domains) ? domains.length : 0;
    const mailboxCount = Array.isArray(mailboxes) ? mailboxes.length : 0;
    res.json({
      configured: true,
      baseUrl: getMailcowBaseUrl(),
      domainCount,
      mailboxCount,
      ok: true,
    });
  } catch (err) {
    res.status(502).json({ configured: true, ok: false, error: err.message });
  }
});

// ── Domains ───────────────────────────────────────────────────────────────────
mailcowRouter.get('/domains', async (_req, res) => {
  try {
    const data = await mailcowGet('/get/domain/all');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

mailcowRouter.post('/domains', async (req, res) => {
  try {
    const data = await mailcowPost('/add/domain', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

mailcowRouter.delete('/domains', async (req, res) => {
  try {
    const data = await mailcowPost('/delete/domain', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Mailboxes ─────────────────────────────────────────────────────────────────
mailcowRouter.get('/mailboxes', async (_req, res) => {
  try {
    const data = await mailcowGet('/get/mailbox/all');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

mailcowRouter.post('/mailboxes', async (req, res) => {
  try {
    const data = await mailcowPost('/add/mailbox', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

mailcowRouter.delete('/mailboxes', async (req, res) => {
  try {
    const data = await mailcowPost('/delete/mailbox', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Aliases ───────────────────────────────────────────────────────────────────
mailcowRouter.get('/aliases', async (_req, res) => {
  try {
    const data = await mailcowGet('/get/alias/all');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

mailcowRouter.post('/aliases', async (req, res) => {
  try {
    const data = await mailcowPost('/add/alias', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

mailcowRouter.delete('/aliases', async (req, res) => {
  try {
    const data = await mailcowPost('/delete/alias', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Mail Queue ────────────────────────────────────────────────────────────────
mailcowRouter.get('/queue', async (_req, res) => {
  try {
    const data = await mailcowGet('/get/mailq/all');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

mailcowRouter.post('/queue/flush', async (_req, res) => {
  try {
    const data = await mailcowPost('/delete/mailq', { items: ['all'] });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
