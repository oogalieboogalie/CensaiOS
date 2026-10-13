// server/routes/social.js
//
// The social canvas, behind the sign-in guard: your profile and the boards
// you show off on it, keys for friends on another censaiOS, who you follow,
// posts, and your feed. The outside door other installs read is
// socialPublic.js.

import express from 'express';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { boardPreview } from '../social/activity.js';
import { buildFeed } from '../social/feed.js';
import { followHere, followRemote, listFollows, unfollow } from '../social/follows.js';
import { SocialError, issueProfileKey, listProfileKeys, revokeProfileKey } from '../social/keys.js';
import { createPost, deletePost } from '../social/posts.js';
import {
  getOrCreateProfile, hideBoard, listPeople, listShowableBoards, listShowcase, showBoard, updateProfile,
} from '../social/profiles.js';
import { forgetPublicFeed } from '../social/publicFeed.js';

const log = createLogger('social');

export function createSocialRouter({ db = pool, remoteOptions = {} } = {}) {
  const router = express.Router();

  const handle = (work) => async (req, res) => {
    const userId = Number(req.session?.userId);
    if (!Number.isInteger(userId) || userId < 1) return res.status(401).json({ error: 'Sign in first.' });
    try {
      res.json(await work(req, userId));
    } catch (error) {
      const status = error.statusCode || (error instanceof SocialError ? 400 : 500);
      if (status >= 500) log.error('social request failed', { error: error.message });
      res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : error.message, code: error.code });
    }
  };
  const changed = (userId, value) => { forgetPublicFeed(userId); return value; };

  async function mine(userId) {
    const [profile, shown, showable, keys] = await Promise.all([
      getOrCreateProfile(db, userId), listShowcase(db, userId, { withToken: true }),
      listShowableBoards(db, userId), listProfileKeys(db, userId),
    ]);
    const boards = [];
    for (const board of shown) {
      const { viewToken, ...rest } = board;
      boards.push({ ...rest, windows: (await boardPreview(board.workspaceId)).windows, ...(viewToken ? { openUrl: `/?join=${encodeURIComponent(viewToken)}` } : {}) });
    }
    return { profile, boards, showable, keys };
  }

  router.get('/me', handle((req, userId) => mine(userId)));
  router.put('/me', handle(async (req, userId) => changed(userId, { profile: await updateProfile(db, userId, req.body || {}) })));

  router.post('/showcase', handle(async (req, userId) => {
    await showBoard(db, userId, req.body || {});
    return changed(userId, mine(userId));
  }));
  router.delete('/showcase/:id', handle(async (req, userId) => {
    if (!(await hideBoard(db, userId, req.params.id))) throw new SocialError('That board is not on your profile.', 404);
    return changed(userId, mine(userId));
  }));

  router.post('/keys', handle(async (req, userId) => {
    const { key, row } = await issueProfileKey(db, { userId, label: req.body?.label });
    return { key, keyRow: row, profile: await getOrCreateProfile(db, userId) };
  }));
  router.delete('/keys/:id', handle(async (req, userId) => ({ ok: await revokeProfileKey(db, { userId, keyId: req.params.id }) })));

  router.get('/people', handle(async (req, userId) => {
    const [people, follows] = await Promise.all([listPeople(db), listFollows(db, userId)]);
    const others = people.filter((person) => person.userId !== userId);
    const shown = await listShowcase(db, others.map((person) => person.userId));
    return {
      people: others.map(({ userId: owner, ...person }) => ({
        ...person,
        boardList: shown.filter((board) => board.userId === owner).map((board) => ({ id: board.id, title: board.title, note: board.note })),
      })),
      follows,
    };
  }));

  router.get('/follows', handle(async (req, userId) => ({ follows: await listFollows(db, userId) })));
  router.post('/follows', handle(async (req, userId) => {
    const body = req.body || {};
    const result = body.address
      ? await followRemote(db, userId, body, remoteOptions)
      : await followHere(db, userId, body);
    return { ...result, follows: await listFollows(db, userId) };
  }));
  router.delete('/follows/:id', handle(async (req, userId) => {
    await unfollow(db, userId, req.params.id);
    return { follows: await listFollows(db, userId) };
  }));

  router.get('/feed', handle((req, userId) => buildFeed(db, userId, remoteOptions)));
  router.post('/posts', handle(async (req, userId) => changed(userId, { post: await createPost(db, userId, req.body || {}) })));
  router.delete('/posts/:id', handle(async (req, userId) => changed(userId, { ok: await deletePost(db, userId, req.params.id) })));

  return router;
}

export const socialRouter = createSocialRouter();
