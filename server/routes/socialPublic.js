// server/routes/socialPublic.js
//
// The outside door for profiles, mounted BEFORE the session guard and on
// the outside-only port next to shared agents: another censaiOS reads a
// person's profile and feed with a key that person handed out.
//   GET /api/social/v1/profiles/:profileId   Bearer csk_... -> signed feed
// The answer is signed by this install's key (the same key that signs agent
// receipts), so the follower can tell it really came from this computer.

import express from 'express';
import pool from '../db.js';
import { canonicalJson } from '../agentNetwork/canonical.js';
import { getInstallSigner } from '../agentNetwork/installIdentity.js';
import { tokenFromRequest } from '../agentEndpoints/tokens.js';
import { createLimiter } from '../agentEndpoints/rateLimit.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { personForKey } from '../social/keys.js';
import { profileById } from '../social/profiles.js';
import { publicFeed } from '../social/publicFeed.js';
import { FEED_KIND } from '../social/remote.js';

const log = createLogger('social');
const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSocialPublicRouter({ db = pool, signer = () => getInstallSigner(db), limiter = createLimiter() } = {}) {
  const router = express.Router();

  router.get('/profiles/:profileId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const profileId = String(req.params.profileId);
      if (!PROFILE_ID.test(profileId)) return res.status(404).json({ error: 'No profile lives at this address.' });
      const profile = await profileById(db, profileId);
      if (!profile) return res.status(404).json({ error: 'No profile lives at this address.' });
      const owner = await personForKey(db, tokenFromRequest(req));
      if (!owner || owner !== profile.userId) {
        // Wrong keys are counted per address so guessing is slow.
        if (!limiter.badKey(`social:${req.ip}`).ok) return res.status(429).json({ error: 'Too many wrong keys. Try again in a minute.' });
        res.set('WWW-Authenticate', 'Bearer realm="censaiOS profile", error="invalid_token"');
        return res.status(401).json({ error: 'That key does not open this profile.' });
      }
      const feed = await publicFeed(db, profile.userId);
      const sign = await signer();
      const body = {
        kind: FEED_KIND, v: 1, at: new Date().toISOString(),
        profile: feed.profile, boards: feed.boards, items: feed.items,
        signer: { install: sign.installId, publicKey: sign.publicKey },
      };
      return res.json({ body, signature: sign.sign(canonicalJson(body)) });
    } catch (error) {
      log.error('profile read failed', { code: safeErrorCode(error) });
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  return router;
}

export const socialPublicRouter = createSocialPublicRouter();
