// The confirmations list. The sign-in guard already ran; this also keeps the
// list to the computer's owner, the same check the rest of the app uses.
import express from 'express';
import { requireSystemAdmin } from '../security/systemAdmin.js';
import { confirmationStore } from '../confirmations/store.js';

const MESSAGES = {
  'confirmations-title': [400, 'Write one sentence about what you need.'],
  'confirmations-full': [429, 'The list is full. Mark something done first.'],
  'confirmations-unreadable': [500, 'The list could not be read.'],
};

function sendError(res, err) {
  const mapped = MESSAGES[err?.code];
  if (mapped) return res.status(mapped[0]).json({ error: mapped[1] });
  return res.status(500).json({ error: 'The list could not be saved.' });
}

export function createConfirmationsRouter({
  store = confirmationStore(),
  requireOwner = requireSystemAdmin,
} = {}) {
  const router = express.Router();

  router.get('/confirmations', requireOwner, (req, res) => {
    try {
      res.json({ items: store.listOpen() });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/confirmations', requireOwner, (req, res) => {
    try {
      const item = store.addAsk({
        title: req.body?.title,
        detail: req.body?.detail,
        actionLabel: req.body?.actionLabel,
      });
      res.status(201).json({ item });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/confirmations/:id/done', requireOwner, (req, res) => {
    try {
      const item = store.markDone(req.params.id);
      if (!item) return res.status(404).json({ error: 'That item is no longer on the list.' });
      res.json({ item });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}

export const confirmationsRouter = createConfirmationsRouter();
