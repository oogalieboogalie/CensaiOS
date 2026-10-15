import express from 'express';
import pool from '../db.js';
import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { isServerKeyOwnerRole } from '../security/serverKeys.js';
import { isKeySharedWith, readKeySharing, setKeySharing } from '../security/keySharing.js';

/**
 * Settings, AI keys, "Share my AI keys with". The owner (an admin) sees every
 * other account on this computer with an on/off switch; anyone else only
 * learns whether the owner shares keys with them. Local installs only: a
 * private team server already shares its keys, the cloud never does.
 */
export const keySharingRouter = express.Router();

function available() {
  return getRuntimeMode() === RUNTIME_MODES.LOCAL_DESKTOP;
}

function canManage(req) {
  return isServerKeyOwnerRole(req.session?.userRole);
}

async function accounts(ownerId, db = pool) {
  const { rows } = await db.query('SELECT id, name, email, role FROM users ORDER BY created_at ASC LIMIT 500');
  const shared = new Set(readKeySharing().userIds);
  return rows
    .filter((row) => String(row.id) !== String(ownerId))
    .map((row) => {
      const owner = isServerKeyOwnerRole(row.role);
      return {
        id: String(row.id),
        name: row.name || '',
        email: row.email || '',
        // Other admins already use this computer's keys; no switch needed.
        alwaysOn: owner,
        shared: owner || shared.has(String(row.id)),
      };
    });
}

keySharingRouter.get('/', async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Sign in first.' });
  if (!available()) return res.json({ available: false, canManage: false, accounts: [] });
  if (!canManage(req)) {
    return res.json({ available: true, canManage: false, accounts: [], sharedWithMe: isKeySharedWith(userId) });
  }
  try {
    res.json({ available: true, canManage: true, accounts: await accounts(userId) });
  } catch (err) {
    console.error('Key sharing list error:', err.message);
    res.status(500).json({ error: 'Could not load the accounts on this computer.' });
  }
});

keySharingRouter.put('/:userId', async (req, res) => {
  if (!available()) return res.status(400).json({ error: 'Key sharing is only for censaiOS on your own computer.' });
  if (!canManage(req)) return res.status(403).json({ error: 'Only the owner of this censaiOS can share its AI keys.' });
  if (typeof req.body?.shared !== 'boolean') return res.status(400).json({ error: 'Say whether to share (on or off).' });
  const targetId = String(req.params.userId || '').trim();
  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [targetId]);
    if (!rows[0]) return res.status(404).json({ error: 'That account is not on this computer.' });
    setKeySharing(targetId, req.body.shared);
    res.json({ available: true, canManage: true, accounts: await accounts(req.session.userId) });
  } catch (err) {
    console.error('Key sharing save error:', err.message);
    res.status(500).json({ error: 'Could not save the setting.' });
  }
});
