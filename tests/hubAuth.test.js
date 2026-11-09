import crypto from 'crypto';
import { jest } from '@jest/globals';
import request from 'supertest';

const RAW_SIGNUP_TOKEN = 'test-token-1234567890abcdef';
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const query = jest.fn();

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
  rateLimit: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../server/hubAccounts/password.js', () => ({
  generateToken: () => 'test-token-1234567890abcdef',
  hashPassword: async () => 'scrypt$abcd$hashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhash',
  verifyPassword: async (pwd) => pwd !== 'WrongPass123!',
}));

jest.unstable_mockModule('../server/hubAccounts/totp.js', () => ({
  newTotpSecret: () => 'TESTSECRET',
  totpUri: () => 'otpauth://totp/Test?secret=TESTSECRET',
  checkTotp: () => true,
}));

jest.unstable_mockModule('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,test'),
  default: { toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,test') },
}));

jest.unstable_mockModule('../server/security/authSession.js', () => ({
  establishAuthenticatedSession: jest.fn().mockResolvedValue(undefined),
}));

const { default: express } = await import('express');
const { hubAuthRouter } = await import('../server/routes/hubAuth.js');
const { establishAuthenticatedSession } = await import('../server/security/authSession.js');
const { onLogRecord } = await import('../server/logger.js');

const OPEN_ENV = ['CENSAI_MODE', 'CENSAI_PUBLIC_SIGNUPS', 'ALLOWED_USERS', 'CENSAI_ADMIN_EMAILS', 'N8N_HUB_SIGNUP_WEBHOOK'];

describe('Hub Auth Routes', () => {
  let app;

  let savedEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    savedEnv = Object.fromEntries(OPEN_ENV.map((key) => [key, process.env[key]]));
    for (const key of OPEN_ENV) delete process.env[key];
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { regenerate: (cb) => cb(), save: (cb) => cb() };
      next();
    });
    app.use('/api/hub-auth', hubAuthRouter);
  });

  afterEach(() => {
    for (const key of OPEN_ENV) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  describe('POST /signup', () => {
    beforeEach(() => {
      process.env.CENSAI_MODE = 'cloud_saas';
    });

    test.each(['private_server', 'local_desktop'])(
      'refuses an allowlisted, unclaimed email when the server is %s',
      async (mode) => {
        process.env.CENSAI_MODE = mode;
        process.env.ALLOWED_USERS = 'alma@example.com';
        query.mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ id: 'uuid-1', username: 'validuser', created_at: new Date() }] });

        const res = await request(app)
          .post('/api/hub-auth/signup')
          .send({ username: 'validuser', email: 'alma@example.com', password: 'ValidPass123!' });

        expect(res.status).toBe(403);
        expect(res.body.signupClosed).toBe(true);
        expect(res.body.error).toMatch(/turned off/i);
        expect(query).not.toHaveBeenCalled();
      },
    );

    test('rejects invalid username', async () => {
      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'ab', email: 'test@example.com', password: 'ValidPass123!' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('3 characters');
    });

    test('rejects username with invalid chars', async () => {
      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'user@name', email: 'test@example.com', password: 'ValidPass123!' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('underscore');
    });

    test('rejects invalid email', async () => {
      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'validuser', email: 'not-an-email', password: 'ValidPass123!' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid email');
    });

    test('rejects weak password', async () => {
      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'validuser', email: 'test@example.com', password: 'weak' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('12 characters');
    });

    test('rejects password without uppercase', async () => {
      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'validuser', email: 'test@example.com', password: 'validpass123!' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('uppercase');
    });

    test('rejects password without lowercase', async () => {
      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'validuser', email: 'test@example.com', password: 'VALIDPASS123!' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('lowercase');
    });

    test('rejects password without number', async () => {
      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'validuser', email: 'test@example.com', password: 'ValidPassword!' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('number');
    });

    test('rejects password without special char', async () => {
      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'validuser', email: 'test@example.com', password: 'ValidPass123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('special');
    });

    test('rejects mismatched passwords', async () => {
      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'validuser', email: 'test@example.com', password: 'ValidPass123!', confirmPassword: 'Different123!' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('match');
    });

    test('creates account on valid input', async () => {
      query.mockResolvedValueOnce({ rows: [] }) // no existing
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-1', username: 'validuser', created_at: new Date() }] });

      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'validuser', email: 'test@example.com', password: 'ValidPass123!' });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.account.username).toBe('validuser');
      expect(res.body.confirmUrl).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain(RAW_SIGNUP_TOKEN);
      const insert = query.mock.calls.find((call) => String(call[0]).startsWith('INSERT'));
      expect(insert[1][4]).toBe(hashToken(RAW_SIGNUP_TOKEN));
      expect(insert[1][4]).not.toBe(RAW_SIGNUP_TOKEN);
    });

    test('does not hand the confirm link back; the owner log gets it when no mail is configured', async () => {
      const seen = [];
      const stop = onLogRecord((record) => {
        if (record.namespace === 'hub-auth') seen.push(record);
      });
      query.mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-1', username: 'validuser', created_at: new Date() }] });

      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'validuser', email: 'test@example.com', password: 'ValidPass123!' });

      stop();
      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toContain(RAW_SIGNUP_TOKEN);
      expect(JSON.stringify(res.body)).not.toContain('confirmUrl');
      expect(seen.some((record) => String(record.meta?.confirmUrl || '').includes(`token=${RAW_SIGNUP_TOKEN}`))).toBe(true);
    });

    test('sends the confirm link to the mail channel and still omits it from the response', async () => {
      process.env.N8N_HUB_SIGNUP_WEBHOOK = 'http://mail.test/hub-signup';
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      const previous = global.fetch;
      global.fetch = fetchMock;
      const seen = [];
      const stop = onLogRecord((record) => {
        if (record.namespace === 'hub-auth') seen.push(record);
      });
      query.mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-1', username: 'validuser', created_at: new Date() }] });

      try {
        const res = await request(app)
          .post('/api/hub-auth/signup')
          .send({ username: 'validuser', email: 'test@example.com', password: 'ValidPass123!' });
        expect(res.status).toBe(201);
        expect(JSON.stringify(res.body)).not.toContain(RAW_SIGNUP_TOKEN);
        const mailed = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(mailed.confirmUrl).toContain(`token=${RAW_SIGNUP_TOKEN}`);
        expect(seen.some((record) => JSON.stringify(record).includes(RAW_SIGNUP_TOKEN))).toBe(false);
      } finally {
        stop();
        global.fetch = previous;
      }
    });

    test('returns 409 for duplicate username', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const res = await request(app)
        .post('/api/hub-auth/signup')
        .send({ username: 'taken', email: 'test@example.com', password: 'ValidPass123!' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already registered');
    });
  });

  describe('GET /confirm-email', () => {
    test('returns 400 without token', async () => {
      const res = await request(app).get('/api/hub-auth/confirm-email');
      expect(res.status).toBe(400);
    });

    test('returns 400 for invalid token', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/hub-auth/confirm-email?token=invalid');
      expect(res.status).toBe(400);
    });

    test('confirms email for valid token', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'uuid-1', email_confirm_expires: new Date(Date.now() + 86400000) }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/hub-auth/confirm-email?token=valid-token');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Email Confirmed');
      expect(query.mock.calls[0][1][0]).toBe(hashToken('valid-token'));
      expect(query.mock.calls[0][1][0]).not.toBe('valid-token');
    });
  });

  describe('POST /login', () => {
    test('rejects missing credentials', async () => {
      const res = await request(app).post('/api/hub-auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    test('rejects invalid username', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/hub-auth/login').send({ username: 'nonexist', password: 'ValidPass123!' });
      expect(res.status).toBe(401);
    });

    test('rejects invalid password', async () => {
      query.mockResolvedValueOnce({ rows: [{ password_hash: 'hash' }] });
      // timingSafeEqual mocked to return false for wrong password
      const res = await request(app).post('/api/hub-auth/login').send({ username: 'user', password: 'WrongPass123!' });
      expect(res.status).toBe(401);
    });

    function confirmedAccount() {
      return {
        id: 'uuid-1',
        username: 'newperson',
        password_hash: 'hash',
        mfa_enabled: false,
        email_confirmed: true,
      };
    }

    test('a confirmed brand-new account does not get a session', async () => {
      query.mockResolvedValueOnce({ rows: [confirmedAccount()] })
        .mockResolvedValueOnce({ rows: [{ email_encrypted: 'encrypted:stranger@example.com' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] });
      const res = await request(app)
        .post('/api/hub-auth/login')
        .send({ username: 'newperson', password: 'ValidPass123!' });
      expect(res.status).toBe(403);
      expect(res.body.approvalRequired).toBe(true);
      expect(establishAuthenticatedSession).not.toHaveBeenCalled();
    });

    test('an account the owner already approved can sign in', async () => {
      query.mockResolvedValueOnce({ rows: [confirmedAccount()] })
        .mockResolvedValueOnce({ rows: [{ email_encrypted: 'encrypted:alma@example.com' }] })
        .mockResolvedValueOnce({ rows: [{ id: 7, email: 'alma@example.com', name: 'Alma', role: 'admin' }] });
      const res = await request(app)
        .post('/api/hub-auth/login')
        .send({ username: 'newperson', password: 'ValidPass123!' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(establishAuthenticatedSession).toHaveBeenCalledWith(
        expect.any(Object),
        { id: 'uuid-1', email: 'alma@example.com', hubAccount: true },
      );
    });

    test('the first account on an empty install can sign in', async () => {
      query.mockResolvedValueOnce({ rows: [confirmedAccount()] })
        .mockResolvedValueOnce({ rows: [{ email_encrypted: 'encrypted:owner@example.com' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });
      const res = await request(app)
        .post('/api/hub-auth/login')
        .send({ username: 'newperson', password: 'ValidPass123!' });
      expect(res.status).toBe(200);
      expect(establishAuthenticatedSession).toHaveBeenCalledWith(
        expect.any(Object),
        { id: 'uuid-1', email: 'owner@example.com', hubAccount: true },
      );
    });

    test('a brand-new account on a cloud server does not get a session', async () => {
      process.env.CENSAI_MODE = 'cloud_saas';
      query.mockResolvedValueOnce({ rows: [confirmedAccount()] })
        .mockResolvedValueOnce({ rows: [{ email_encrypted: 'encrypted:stranger@example.com' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });
      const res = await request(app)
        .post('/api/hub-auth/login')
        .send({ username: 'newperson', password: 'ValidPass123!' });
      expect(res.status).toBe(403);
      expect(res.body.approvalRequired).toBe(true);
      expect(establishAuthenticatedSession).not.toHaveBeenCalled();
    });

    test('an address the owner listed can sign in', async () => {
      process.env.ALLOWED_USERS = 'alma@example.com';
      query.mockResolvedValueOnce({ rows: [confirmedAccount()] })
        .mockResolvedValueOnce({ rows: [{ email_encrypted: 'encrypted:alma@example.com' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] });
      const res = await request(app)
        .post('/api/hub-auth/login')
        .send({ username: 'newperson', password: 'ValidPass123!' });
      expect(res.status).toBe(200);
      expect(establishAuthenticatedSession).toHaveBeenCalledWith(
        expect.any(Object),
        { id: 'uuid-1', email: 'alma@example.com', hubAccount: true },
      );
    });
  });
});