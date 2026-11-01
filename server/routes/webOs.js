import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { authSecurityRateLimiter } from '../middleware/standardRateLimits.js';
import { establishAuthenticatedSession } from '../security/authSession.js';
import {
  candidateHosts,
  doorUsable,
  isFromAnotherComputer,
  readDoorSettings,
  writeDoorSettings,
} from '../webOs/door.js';
import { createPairCode, redeemPairCode } from '../webOs/pairing.js';
import { doorPublicPort } from '../webOs/doorListener.js';
import { isJestRun } from '../security/testShortcut.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('web-os');

/**
 * Open anywhere (web OS). The public router is mounted before the sign-in
 * guard: another computer redeems its "Add a computer" code there. The
 * signed-in router reads and changes the switch and makes the codes.
 */
export const webOsPublicRouter = express.Router();
export const webOsRouter = express.Router();

webOsPublicRouter.post('/pair/redeem', authSecurityRateLimiter, async (req, res) => {
  if (!dbReady()) {
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ error: 'censaiOS is still starting, please try again in a moment.' });
  }
  const match = redeemPairCode(req.body?.code);
  if (!match) {
    return res.status(400).json({ error: 'That code was used already or has run out. Make a new one on your main computer.' });
  }
  try {
    const { rows } = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [match.userId]);
    if (!rows[0]) return res.status(400).json({ error: 'That account no longer exists.' });
    await establishAuthenticatedSession(req, rows[0]);
    res.json({ ok: true, user: { id: rows[0].id, name: rows[0].name } });
  } catch (err) {
    log.error('open anywhere sign-in failed', { code: safeErrorCode(err) });
    res.status(500).json({ error: 'Could not sign this computer in.' });
  }
});

/**
 * Email sign-in is not offered to another computer that came in through the
 * Open anywhere switch: anyone on the Wi-Fi could type an email. They use a
 * code made on the main computer instead.
 */
export function refuseEmailSignInFromAnotherComputer(req, res, next) {
  if (!isFromAnotherComputer(req)) return next();
  return res.status(403).json({
    error: 'On another computer, sign in with a code. On your main computer open Settings, Open anywhere, Add a computer.',
    pairRequired: true,
  });
}

function canManage(req) {
  return req.session?.userRole === 'admin' || isJestRun();
}

function statusFor(req) {
  const settings = readDoorSettings();
  return {
    open: settings.open,
    address: settings.address,
    hosts: candidateHosts({ settings }),
    // Other computers come in on their own port (docker-compose.yml); a copy
    // without it (the desktop app, npm run dev) stays on this computer only.
    available: doorUsable() && doorPublicPort() !== null,
    thisComputerOnly: doorUsable() && doorPublicPort() === null,
    port: doorPublicPort(),
    canManage: canManage(req),
    fromAnotherComputer: isFromAnotherComputer(req),
  };
}

webOsRouter.get('/', (req, res) => {
  res.json(statusFor(req));
});

webOsRouter.put('/', (req, res) => {
  if (!canManage(req)) {
    return res.status(403).json({ error: 'Only the owner of this censaiOS can change this.' });
  }
  const patch = {};
  if (typeof req.body?.open === 'boolean') patch.open = req.body.open;
  if (typeof req.body?.address === 'string') patch.address = req.body.address;
  try {
    writeDoorSettings(patch);
    res.json(statusFor(req));
  } catch (err) {
    log.error('open anywhere settings not saved', { code: safeErrorCode(err) });
    res.status(500).json({ error: 'Could not save the setting.' });
  }
});

webOsRouter.post('/pair', (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Sign in first.' });
  res.json(createPairCode(userId));
});
