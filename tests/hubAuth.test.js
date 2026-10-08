import { jest } from '@jest/globals';
import request from 'supertest';

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

jest.unstable_mockModule('otplib', () => ({
  authenticator: {
    generateSecret: () => 'TESTSECRET',
    keyuri: () => 'otpauth://totp/Test?secret=TESTSECRET',
    check: () => true,
  },
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

describe('Hub Auth Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { regenerate: (cb) => cb(), save: (cb) => cb() };
      next();
    });
    app.use('/api/hub-auth', hubAuthRouter);
  });

  describe('POST /signup', () => {
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
      expect(res.body.confirmUrl).toContain('token=');
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
  });
});