import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { __resetProjectorsForTests, configureProjector } from '../server/shareLinks/projector.js';

const published = [];
jest.unstable_mockModule('../server/collaboration/workspaceHub.js', () => ({
  publishWorkspaceEvent: jest.fn((_id, event) => { published.push(event); }),
}));

const { registerGuestCommentTranslate, registerMemberCommentTranslate } = await import('../server/routes/commentTranslate.js');
const { commentTranslateLimiter, createTranslateLimiter } = await import('../server/shareLinks/translateLimit.js');
const { translationHold } = await import('../server/shareLinks/commentTranslate.js');

function commentRow(over = {}) {
  return {
    id: 'c1', workspace_id: 'board', thread_id: null, link_id: null,
    author_kind: 'user', author_id: '1', author_name: 'Sam', author_color: null,
    body: 'See you at noon', x: 10, y: 20, window_id: null, mentions: [],
    resolved_at: null, resolved_by: null, translation: null,
    created_at: '2026-11-02T12:00:00.000Z',
    ...over,
  };
}

function dbFor(row) {
  const rows = Array.isArray(row) ? row : [row];
  return {
    query: jest.fn(async (sql, params = []) => {
      if (/agent_tokens_used/.test(sql)) {
        return { rows: [{ agent_budget_tokens: 20000, agent_tokens_used: params[1] }] };
      }
      const found = rows.find((item) => item.id === params[1]);
      if (/SELECT/.test(sql) && /canvas_comments/.test(sql)) {
        return { rows: found ? [found] : [] };
      }
      if (/SET translation/.test(sql)) {
        if (!found) return { rows: [] };
        found.translation = JSON.parse(params[2]);
        return { rows: [{ ...found }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
}

function appWith(register) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId: '1', save: (cb) => cb() };
    next();
  });
  const router = express.Router();
  register(router);
  app.use(register === registerGuestCommentTranslate ? '/api/guest' : '/api', router);
  return app;
}

beforeEach(() => {
  published.length = 0;
  commentTranslateLimiter.reset();
});

test('a member translates a comment English to French and the board hears it', async () => {
  const row = commentRow();
  const complete = jest.fn(async () => '```\n"À midi"\n```');
  const app = appWith((router) => registerMemberCommentTranslate(router, {
    db: dbFor(row),
    requireMember: async () => ({ id: 'board', role: 'member' }),
    complete,
  }));
  const res = await request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'en-fr' });
  expect(res.status).toBe(200);
  expect(res.body.comment).toMatchObject({
    body: 'See you at noon',
    translation: { pair: 'en-fr', text: 'À midi' },
  });
  expect(complete).toHaveBeenCalledTimes(1);
  expect(published[0]).toMatchObject({ type: 'comment.upsert', comment: { translation: { text: 'À midi' } } });
  const again = await request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'en-fr' });
  expect(again.status).toBe(200);
  expect(again.body.comment.translation.text).toBe('À midi');
  expect(complete).toHaveBeenCalledTimes(1);
});

test('switching direction reuses the original text and does not call the model again', async () => {
  const row = commentRow({ body: 'See you at noon' });
  const complete = jest.fn(async () => 'À midi');
  const app = appWith((router) => registerMemberCommentTranslate(router, {
    db: dbFor(row),
    requireMember: async () => ({ id: 'board', role: 'member' }),
    complete,
  }));
  const translated = await request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'en-fr' });
  expect(translated.status).toBe(200);
  const back = await request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'fr-en' });
  expect(back.status).toBe(200);
  expect(back.body.comment.translation).toEqual({ pair: 'fr-en', text: 'See you at noon' });
  const again = await request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'en-fr' });
  expect(again.status).toBe(200);
  expect(again.body.comment.translation).toEqual({ pair: 'en-fr', text: 'À midi' });
  expect(complete).toHaveBeenCalledTimes(1);
});

test('a view-only member cannot translate', async () => {
  const complete = jest.fn(async () => 'Bonjour');
  const app = appWith((router) => registerMemberCommentTranslate(router, {
    db: dbFor(commentRow()),
    requireMember: async (_db, { roles = ['owner', 'admin', 'member', 'viewer'] }) => {
      const role = 'viewer';
      if (!roles.includes(role)) {
        throw Object.assign(new Error('Workspace role does not allow this operation'), { statusCode: 403 });
      }
      return { id: 'board', role };
    },
    complete,
  }));
  const res = await request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'en-fr' });
  expect(res.status).toBe(403);
  expect(res.body.error).toBe('Workspace role does not allow this operation');
  expect(complete).not.toHaveBeenCalled();
});

test('an unknown language pair is refused before the model is called', async () => {
  const complete = jest.fn();
  const app = appWith((router) => registerMemberCommentTranslate(router, {
    db: dbFor(commentRow()),
    requireMember: async () => ({ id: 'board', role: 'member' }),
    complete,
  }));
  const res = await request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'en-de' });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('TRANSLATION_PAIR');
  expect(complete).not.toHaveBeenCalled();
});

test('a guest translates with the board owner key, French to English', async () => {
  const row = commentRow({ body: 'À tout à l\'heure' });
  const seen = [];
  const db = dbFor(row);
  const access = {
    capabilities: { canComment: true },
    link: {
      id: 'link-1', workspace_id: 'board', created_by_user_id: 7, scope_kind: 'board', stage: false,
      agent_budget_tokens: 20000, agent_tokens_used: 0,
    },
    guest: { name: 'Marie', guestId: 'g1' },
  };
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerGuestCommentTranslate(router, async () => access, {
    db,
    complete: async ({ userId, messages }) => {
      seen.push({ userId, text: messages[1].content });
      return 'See you soon';
    },
  });
  app.use('/api/guest', router);
  const res = await request(app).post('/api/guest/comments/c1/translate').send({ pair: 'fr-en' });
  expect(res.status).toBe(200);
  expect(res.body.comment.translation).toEqual({ pair: 'fr-en', text: 'See you soon' });
  expect(seen).toEqual([{ userId: 7, text: 'À tout à l\'heure' }]);
  expect(db.query.mock.calls.some(([sql]) => /agent_tokens_used/.test(sql))).toBe(true);
});

test('a guest link with no agent budget left cannot translate', async () => {
  for (const budget of [
    { agent_budget_tokens: 0, agent_tokens_used: 0 },
    { agent_budget_tokens: 100, agent_tokens_used: 100 },
  ]) {
    const complete = jest.fn(async () => 'Bonjour');
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerGuestCommentTranslate(router, async () => ({
      capabilities: { canComment: true },
      link: {
        id: 'link-1', workspace_id: 'board', created_by_user_id: 7, scope_kind: 'board', stage: false,
        ...budget,
      },
      guest: { name: 'Marie', guestId: 'g1' },
    }), { db: dbFor(commentRow()), complete });
    app.use('/api/guest', router);
    const res = await request(app).post('/api/guest/comments/c1/translate').send({ pair: 'en-fr' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('GUEST_TRANSLATE_BUDGET');
    expect(complete).not.toHaveBeenCalled();
  }
});

test('a view-only guest cannot translate', async () => {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerGuestCommentTranslate(router, async () => ({
    capabilities: { canComment: false },
    link: { workspace_id: 'board', created_by_user_id: 7 },
  }), { db: dbFor(commentRow()), complete: jest.fn() });
  app.use('/api/guest', router);
  const res = await request(app).post('/api/guest/comments/c1/translate').send({ pair: 'en-fr' });
  expect(res.status).toBe(403);
  expect(res.body.code).toBe('GUEST_CANNOT_COMMENT');
});

test('a comment longer than the cap is not sent to the model', async () => {
  const complete = jest.fn(async () => 'Bonjour');
  const app = appWith((router) => registerMemberCommentTranslate(router, {
    db: dbFor(commentRow({ body: 'a'.repeat(2001) })),
    requireMember: async () => ({ id: 'board', role: 'member' }),
    complete,
  }));
  const res = await request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'en-fr' });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('TRANSLATION_TOO_LONG');
  expect(complete).not.toHaveBeenCalled();
});

test('a guest who translates too fast is refused before another model call', async () => {
  let calls = 0;
  const limiter = { allow() { calls += 1; return calls <= 1; } };
  const complete = jest.fn(async () => 'Bonjour');
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerGuestCommentTranslate(router, async () => ({
    capabilities: { canComment: true },
    link: {
      id: 'link-1', workspace_id: 'board', created_by_user_id: 7, scope_kind: 'board', stage: false,
      agent_budget_tokens: 20000, agent_tokens_used: 0,
    },
    guest: { name: 'Marie', guestId: 'g1' },
  }), {
    db: dbFor([commentRow({ id: 'c1', body: 'One' }), commentRow({ id: 'c2', body: 'Two' })]),
    complete,
    limiter,
  });
  app.use('/api/guest', router);
  const first = await request(app).post('/api/guest/comments/c1/translate').send({ pair: 'en-fr' });
  const second = await request(app).post('/api/guest/comments/c2/translate').send({ pair: 'en-fr' });
  expect(first.status).toBe(200);
  expect(second.status).toBe(429);
  expect(second.body.code).toBe('TRANSLATION_RATE');
  expect(complete).toHaveBeenCalledTimes(1);
});

test('clicking the wrong direction first does not relabel the original comment', async () => {
  const row = commentRow({ body: 'See you at noon' });
  const complete = jest.fn(async ({ messages }) => (
    String(messages[0].content).includes('English to French') ? 'À midi' : 'Not the original'
  ));
  const app = appWith((router) => registerMemberCommentTranslate(router, {
    db: dbFor(row),
    requireMember: async () => ({ id: 'board', role: 'member' }),
    complete,
  }));
  const wrong = await request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'fr-en' });
  expect(wrong.status).toBe(200);
  expect(wrong.body.comment.translation).toEqual({ pair: 'fr-en', text: 'Not the original' });
  const right = await request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'en-fr' });
  expect(right.status).toBe(200);
  expect(right.body.comment.translation).toEqual({ pair: 'en-fr', text: 'À midi' });
  expect(complete).toHaveBeenCalledTimes(2);
});

function guestApp({ link, guestId, db, complete, limiter }) {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerGuestCommentTranslate(router, async () => ({
    capabilities: { canComment: true },
    link,
    guest: { name: 'Marie', guestId },
  }), { db, complete, limiter });
  app.use('/api/guest', router);
  return app;
}

test('a burst of guest translations cannot spend past the link budget', async () => {
  const body = 'a'.repeat(400);
  const hold = translationHold(body);
  const link = {
    id: 'link-1', workspace_id: 'board', created_by_user_id: 7, scope_kind: 'board', stage: false,
    agent_budget_tokens: hold * 2, agent_tokens_used: 0,
  };
  const comments = Array.from({ length: 8 }, (_item, index) => commentRow({ id: `c${index}`, body }));
  const ledger = { used: 0, budget: link.agent_budget_tokens };
  const db = {
    query: jest.fn(async (sql, params = []) => {
      if (/<= agent_budget_tokens/.test(sql)) {
        const cost = Number(params[1]);
        if (ledger.used + cost <= ledger.budget) {
          ledger.used += cost;
          return { rows: [{ agent_budget_tokens: ledger.budget, agent_tokens_used: ledger.used }] };
        }
        return { rows: [] };
      }
      if (/GREATEST\(0, agent_tokens_used -/.test(sql)) {
        ledger.used = Math.max(0, ledger.used - Number(params[1]));
        return { rows: [{ agent_budget_tokens: ledger.budget, agent_tokens_used: ledger.used }] };
      }
      if (/agent_tokens_used = agent_tokens_used \+/.test(sql)) {
        ledger.used += Number(params[1]);
        return { rows: [{ agent_budget_tokens: ledger.budget, agent_tokens_used: ledger.used }] };
      }
      const found = comments.find((item) => item.id === params[1]);
      if (/SELECT/.test(sql) && /canvas_comments/.test(sql)) return { rows: found ? [found] : [] };
      if (/SET translation/.test(sql)) {
        if (!found) return { rows: [] };
        found.translation = JSON.parse(params[2]);
        return { rows: [{ ...found }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
  const complete = jest.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return 'Bonjour';
  });
  const app = guestApp({
    link, guestId: 'g1', db, complete, limiter: createTranslateLimiter({ max: 100 }),
  });
  const results = await Promise.all(comments.map((comment) => (
    request(app).post(`/api/guest/comments/${comment.id}/translate`).send({ pair: 'en-fr' })
  )));
  const paid = results.filter((res) => res.status === 200);
  expect(paid).toHaveLength(2);
  expect(complete).toHaveBeenCalledTimes(2);
  expect(ledger.used).toBeLessThanOrEqual(ledger.budget);
  expect(results.filter((res) => res.status === 403).every((res) => res.body.code === 'GUEST_TRANSLATE_BUDGET')).toBe(true);
});

test('rejoining a share link does not reset the translation limit', async () => {
  const limiter = createTranslateLimiter({ max: 1 });
  const db = dbFor([commentRow({ id: 'c1', body: 'One' }), commentRow({ id: 'c2', body: 'Two' }), commentRow({ id: 'c3', body: 'Three' })]);
  const complete = jest.fn(async () => 'Bonjour');
  const link = {
    id: 'link-1', workspace_id: 'board', created_by_user_id: 7, scope_kind: 'board', stage: false,
    agent_budget_tokens: 20000, agent_tokens_used: 0,
  };
  let guestId = 'g1';
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerGuestCommentTranslate(router, async () => ({
    capabilities: { canComment: true },
    link,
    guest: { name: 'Marie', guestId },
  }), { db, complete, limiter });
  app.use('/api/guest', router);
  const first = await request(app).post('/api/guest/comments/c1/translate').send({ pair: 'en-fr' });
  guestId = 'g2';
  const rejoined = await request(app).post('/api/guest/comments/c2/translate').send({ pair: 'en-fr' });
  const other = guestApp({
    link: { ...link, id: 'link-2' },
    guestId: 'g3',
    db: dbFor(commentRow({ id: 'c3', body: 'Three' })),
    complete,
    limiter,
  });
  const elsewhere = await request(other).post('/api/guest/comments/c3/translate').send({ pair: 'en-fr' });
  expect(first.status).toBe(200);
  expect(rejoined.status).toBe(429);
  expect(rejoined.body.code).toBe('TRANSLATION_RATE');
  expect(elsewhere.status).toBe(200);
  expect(complete).toHaveBeenCalledTimes(2);
});

function postTranslate(app, url) {
  return new Promise((resolve, reject) => {
    request(app).post(url).send({ pair: 'en-fr' }).end((err, res) => (err ? reject(err) : resolve(res)));
  });
}

test('a one-window link cannot join a member translation outside that window', async () => {
  __resetProjectorsForTests();
  configureProjector({
    reader: async () => null,
    fallback: async () => ({
      wins: [{ id: 'brief', kind: 'doc', x: 0, y: 0, w: 10, h: 10 }],
      canvasGroups: [], paths: [], links: [],
    }),
  });
  try {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let started;
    const inModel = new Promise((resolve) => { started = resolve; });
    const row = commentRow({ window_id: 'other', body: 'See you at noon' });
    const db = dbFor(row);
    const complete = jest.fn(async () => {
      started();
      await gate;
      return 'À midi';
    });
    const memberApp = appWith((router) => registerMemberCommentTranslate(router, {
      db, complete, requireMember: async () => ({ id: 'board', role: 'member' }),
    }));
    const guest = guestApp({
      link: {
        id: 'link-window', workspace_id: 'board', created_by_user_id: 7,
        scope_kind: 'window', scope_id: 'brief', stage: false,
        agent_budget_tokens: 20000, agent_tokens_used: 0,
      },
      guestId: 'g1', db, complete, limiter: createTranslateLimiter({ max: 100 }),
    });
    const memberReq = postTranslate(memberApp, '/api/workspaces/board/comments/c1/translate');
    await inModel;
    const guestRes = await Promise.race([
      postTranslate(guest, '/api/guest/comments/c1/translate'),
      new Promise((resolve) => setTimeout(() => resolve({ status: 0, body: {} }), 250)),
    ]);
    release();
    const memberRes = await memberReq;
    expect(guestRes.status).toBe(404);
    expect(guestRes.body.code).toBe('COMMENT_MISSING');
    expect(memberRes.status).toBe(200);
    expect(memberRes.body.comment.translation.text).toBe('À midi');
    expect(complete).toHaveBeenCalledTimes(1);
  } finally {
    __resetProjectorsForTests();
  }
});

test('a member never receives a guest budget error', async () => {
  let releaseGuest;
  const guestHold = new Promise((resolve) => { releaseGuest = resolve; });
  let holding;
  const guestWaiting = new Promise((resolve) => { holding = resolve; });
  const row = commentRow();
  const db = {
    query: jest.fn(async (sql, params = []) => {
      if (/<= agent_budget_tokens/.test(sql)) {
        holding();
        await guestHold;
        return { rows: [] };
      }
      if (/GREATEST\(0, agent_tokens_used -/.test(sql)) {
        return { rows: [{ agent_budget_tokens: 1, agent_tokens_used: 0 }] };
      }
      if (/SELECT/.test(sql) && /canvas_comments/.test(sql)) return { rows: params[1] === row.id ? [row] : [] };
      if (/SET translation/.test(sql)) {
        row.translation = JSON.parse(params[2]);
        return { rows: [{ ...row }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
  const complete = jest.fn(async () => 'À midi');
  const memberApp = appWith((router) => registerMemberCommentTranslate(router, {
    db, complete, requireMember: async () => ({ id: 'board', role: 'member' }),
  }));
  const guest = guestApp({
    link: {
      id: 'link-1', workspace_id: 'board', created_by_user_id: 7, scope_kind: 'board', stage: false,
      agent_budget_tokens: 1, agent_tokens_used: 0,
    },
    guestId: 'g1', db, complete, limiter: createTranslateLimiter({ max: 100 }),
  });
  const guestReq = postTranslate(guest, '/api/guest/comments/c1/translate');
  await guestWaiting;
  const memberRes = await Promise.race([
    postTranslate(memberApp, '/api/workspaces/board/comments/c1/translate'),
    new Promise((resolve) => setTimeout(() => resolve({ status: 0, body: { code: 'WAITED' } }), 250)),
  ]);
  releaseGuest();
  const guestRes = await guestReq;
  expect(memberRes.status).toBe(200);
  expect(memberRes.body.code).not.toBe('GUEST_TRANSLATE_BUDGET');
  expect(memberRes.body.comment.translation.text).toBe('À midi');
  expect(guestRes.status).toBe(403);
  expect(guestRes.body.code).toBe('GUEST_TRANSLATE_BUDGET');
  expect(complete).toHaveBeenCalledTimes(1);
});

test('two clicks at once on one comment call the model once', async () => {
  const complete = jest.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return 'À midi';
  });
  const app = appWith((router) => registerMemberCommentTranslate(router, {
    db: dbFor(commentRow()),
    requireMember: async () => ({ id: 'board', role: 'member' }),
    complete,
  }));
  const [first, second] = await Promise.all([
    request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'en-fr' }),
    request(app).post('/api/workspaces/board/comments/c1/translate').send({ pair: 'en-fr' }),
  ]);
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(first.body.comment.translation.text).toBe('À midi');
  expect(second.body.comment.translation.text).toBe('À midi');
  expect(complete).toHaveBeenCalledTimes(1);
});

test('the translation limiter allows a fixed number of calls per minute', () => {
  let now = 5_000;
  const limiter = createTranslateLimiter({ max: 1, now: () => now });
  expect(limiter.allow('guest:1')).toBe(true);
  expect(limiter.allow('guest:1')).toBe(false);
  expect(limiter.allow('guest:2')).toBe(true);
  now += 60_000;
  expect(limiter.allow('guest:1')).toBe(true);
});
