import { jest } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const HUB_ID = '11111111-1111-4111-8111-111111111111';

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query },
}));

jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady: () => true,
}));

jest.unstable_mockModule('../server/hubAccounts/encryption.js', () => ({
  encryptEmail: jest.fn((email) => `encrypted:${email}`),
  decryptEmail: jest.fn((cipher) => cipher.replace('encrypted:', '')),
  hashEmail: jest.fn((email) => `hash:${email}`),
}));

jest.unstable_mockModule('express-rate-limit', () => ({
  rateLimit: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../server/hubAccounts/password.js', () => ({
  generateToken: () => 'test-token-1234567890abcdef',
  hashPassword: async () => 'scrypt$abcd$hash',
  verifyPassword: async (pwd) => pwd !== 'WrongPass123!',
}));

jest.unstable_mockModule('../server/hubAccounts/totp.js', () => ({
  newTotpSecret: () => 'TESTSECRET',
  totpUri: () => 'otpauth://totp/Test',
  checkTotp: () => true,
}));

const { default: express } = await import('express');
const { hubAuthRouter } = await import('../server/routes/hubAuth.js');
const { requireAuthorizedSession } = await import('../server/security/sessionGuard.js');

function appWithSession() {
  const session = {};
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = session;
    session.regenerate = (cb) => {
      for (const key of Object.keys(session)) {
        if (key !== 'regenerate' && key !== 'save') delete session[key];
      }
      cb();
    };
    session.save = (cb) => cb();
    next();
  });
  app.use('/api/hub-auth', hubAuthRouter);
  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path === '/ready') return next();
    return requireAuthorizedSession(req, res, next);
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, probe: true }));
  app.get('/api/notes', (req, res) => res.json({ ok: true, userId: req.session.userId }));
  return { app, session };
}

describe('hub sessions are not full Homebase users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    delete process.env.CENSAI_MODE;
    delete process.env.CENSAI_PUBLIC_SIGNUPS;
    delete process.env.ALLOWED_USERS;
    delete process.env.CENSAI_ADMIN_EMAILS;
  });

  test('an approved hub login cannot open a guarded API route', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: HUB_ID,
        username: 'newperson',
        password_hash: 'hash',
        mfa_enabled: false,
        email_confirmed: true,
      }],
    })
      .mockResolvedValueOnce({ rows: [{ email_encrypted: 'encrypted:alma@example.com' }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, email: 'alma@example.com', name: 'Alma', role: 'admin' }] });

    const { app, session } = appWithSession();
    const login = await request(app)
      .post('/api/hub-auth/login')
      .send({ username: 'newperson', password: 'ValidPass123!' });
    expect(login.status).toBe(200);
    expect(session.userId).toBe(HUB_ID);
    expect(session.userRole).toBeUndefined();

    const notes = await request(app).get('/api/notes');
    expect(notes.status).toBe(403);
    expect(notes.body.ok).toBeUndefined();
    expect(session.hubAccount).toBe(true);

    session.userId = 7;
    session.userRole = 'admin';
    session.userEmail = 'alma@example.com';
    delete session.hubAccount;
    const owner = await request(app).get('/api/notes');
    expect(owner.status).toBe(200);
    expect(owner.body.userId).toBe(7);

    delete session.userId;
    const guest = await request(app).get('/api/notes');
    expect(guest.status).toBe(401);
    const probe = await request(app).get('/api/health');
    expect(probe.status).toBe(200);
    expect(probe.body.probe).toBe(true);
  });
});
