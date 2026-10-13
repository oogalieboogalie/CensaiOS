import express from 'express';
import { rateLimit } from 'express-rate-limit';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { encryptEmail, decryptEmail, hashEmail } from '../hubAccounts/encryption.js';
import { validateUsername, validateEmail, validatePassword } from '../hubAccounts/validation.js';
import { generateToken, hashPassword, verifyPassword } from '../hubAccounts/password.js';
import { authSecurityRateLimiter } from '../middleware/standardRateLimits.js';
import { establishAuthenticatedSession } from '../security/authSession.js';

const HUB_LIMITER = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Please try again shortly.' } });

export const hubAuthRouter = express.Router();

hubAuthRouter.post('/signup', authSecurityRateLimiter, HUB_LIMITER, async (req, res) => {
  if (!dbReady()) {
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ error: 'Database initializing, please retry in a moment.' });
  }
  const { username, email, password, confirmPassword } = req.body;
  const uErr = validateUsername(username);
  if (uErr) return res.status(400).json({ error: uErr });
  const eErr = validateEmail(email);
  if (eErr) return res.status(400).json({ error: eErr });
  const pErr = validatePassword(password);
  if (pErr) return res.status(400).json({ error: pErr });
  if (confirmPassword !== undefined && confirmPassword !== password) return res.status(400).json({ error: 'Passwords must match' });

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const emailHash = hashEmail(trimmedEmail);

  try {
    const existing = await pool.query('SELECT 1 FROM hub_accounts WHERE username = $1 OR email_hash = $2', [trimmedUsername, emailHash]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Username or email already registered' });

    const passwordHash = await hashPassword(password);
    const emailEncrypted = encryptEmail(trimmedEmail);
    const confirmToken = generateToken();
    const confirmExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { rows } = await pool.query(
      'INSERT INTO hub_accounts (username, email_encrypted, email_hash, password_hash, email_confirm_token, email_confirm_expires) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, created_at',
      [trimmedUsername, emailEncrypted, emailHash, passwordHash, confirmToken, confirmExpires],
    );
    const account = rows[0];
    const confirmUrl = `${process.env.APP_ORIGIN || 'http://localhost:5173'}/confirm-email?token=${confirmToken}`;

    const webhook = process.env.N8N_HUB_SIGNUP_WEBHOOK;
    if (webhook) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'hub_account_signup', username: trimmedUsername, emailCipher: emailEncrypted, emailHash, confirmUrl, timestamp: new Date().toISOString() }),
        });
      } catch (err) {
        console.warn('[hubAuth] n8n webhook failed:', err.message);
      }
    }

    res.status(201).json({ ok: true, account: { id: account.id, username: account.username }, message: 'Account created. Check your email to confirm.', confirmUrl });
  } catch (err) {
    console.error('Hub signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

hubAuthRouter.post('/login', authSecurityRateLimiter, HUB_LIMITER, async (req, res) => {
  if (!dbReady()) {
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ error: 'Database initializing, please retry in a moment.' });
  }
  const { username, password, mfaCode } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  try {
    const { rows } = await pool.query('SELECT id, username, password_hash, mfa_secret, mfa_enabled, email_confirmed FROM hub_accounts WHERE username = $1', [username.trim()]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const account = rows[0];
    const valid = await verifyPassword(password, account.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    if (!account.email_confirmed) return res.status(403).json({ error: 'Email not confirmed', needsConfirmation: true });
    if (account.mfa_enabled) {
      if (!mfaCode) return res.status(400).json({ error: 'MFA code required', mfaRequired: true });
      const { authenticator } = await import('otplib');
      if (!authenticator.check(mfaCode, account.mfa_secret)) return res.status(401).json({ error: 'Invalid MFA code' });
    }
    const encRow = await pool.query('SELECT email_encrypted FROM hub_accounts WHERE id = $1', [account.id]);
    const email = decryptEmail(encRow.rows[0]?.email_encrypted);
    await establishAuthenticatedSession(req, { id: account.id, role: 'user', email });
    res.json({ ok: true, user: { id: account.id, username: account.username } });
  } catch (err) {
    console.error('Hub login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

hubAuthRouter.get('/confirm-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Invalid confirmation link');
  try {
    const { rows } = await pool.query('SELECT id, email_confirm_expires FROM hub_accounts WHERE email_confirm_token = $1', [token]);
    if (rows.length === 0) return res.status(400).send('Invalid or expired confirmation link');
    if (new Date(rows[0].email_confirm_expires) < new Date()) return res.status(400).send('Confirmation link has expired');
    await pool.query('UPDATE hub_accounts SET email_confirmed = TRUE, email_confirm_token = NULL, email_confirm_expires = NULL, updated_at = NOW() WHERE id = $1', [rows[0].id]);
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Email Confirmed</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a12;color:#e8e8ed}.card{text-align:center;padding:2rem;border:1px solid #2a2a3e;border-radius:12px;background:#11111a}</style></head><body><div class="card"><h1>Email Confirmed</h1><p>Your CensaiHub account is ready.</p><a href="${process.env.APP_ORIGIN || 'http://localhost:5173'}" style="color:#f97316">Return to CensaiHub</a></div></body></html>`);
  } catch (err) {
    console.error('Email confirmation error:', err);
    res.status(500).send('Confirmation failed');
  }
});

hubAuthRouter.post('/mfa-setup', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { rows } = await pool.query('SELECT mfa_secret, mfa_enabled FROM hub_accounts WHERE id = $1', [req.session.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    if (rows[0].mfa_enabled) return res.status(400).json({ error: 'MFA already enabled' });
    const { authenticator } = await import('otplib');
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(`user_${req.session.userId}`, 'CensaiHub', secret);
    await pool.query('UPDATE hub_accounts SET mfa_secret = $1, updated_at = NOW() WHERE id = $2', [secret, req.session.userId]);
    const qrMod = await import('qrcode');
    const toDataURL = qrMod.toDataURL || qrMod.default?.toDataURL;
    const qrDataUrl = await toDataURL(otpauth);
    res.json({ ok: true, secret, qrDataUrl, message: 'Scan QR code with authenticator app, then verify with /mfa-verify' });
  } catch (err) {
    console.error('MFA setup error:', err);
    res.status(500).json({ error: 'MFA setup failed' });
  }
});

hubAuthRouter.post('/mfa-verify', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'MFA code required' });
  try {
    const { rows } = await pool.query('SELECT mfa_secret, mfa_enabled FROM hub_accounts WHERE id = $1', [req.session.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    if (rows[0].mfa_enabled) return res.status(400).json({ error: 'MFA already enabled' });
    const { authenticator } = await import('otplib');
    if (!authenticator.check(code, rows[0].mfa_secret)) return res.status(401).json({ error: 'Invalid MFA code' });
    await pool.query('UPDATE hub_accounts SET mfa_enabled = TRUE, updated_at = NOW() WHERE id = $1', [req.session.userId]);
    res.json({ ok: true, message: 'MFA enabled successfully' });
  } catch (err) {
    console.error('MFA verify error:', err);
    res.status(500).json({ error: 'MFA verification failed' });
  }
});

hubAuthRouter.post('/mfa-disable', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { password, mfaCode } = req.body;
  if (!password || !mfaCode) return res.status(400).json({ error: 'Password and MFA code required' });
  try {
    const { rows } = await pool.query('SELECT password_hash, mfa_secret, mfa_enabled FROM hub_accounts WHERE id = $1', [req.session.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    if (!rows[0].mfa_enabled) return res.status(400).json({ error: 'MFA not enabled' });
    if (!(await verifyPassword(password, rows[0].password_hash))) return res.status(401).json({ error: 'Invalid password' });
    const { authenticator } = await import('otplib');
    if (!authenticator.check(mfaCode, rows[0].mfa_secret)) return res.status(401).json({ error: 'Invalid MFA code' });
    await pool.query('UPDATE hub_accounts SET mfa_enabled = FALSE, mfa_secret = NULL, updated_at = NOW() WHERE id = $1', [req.session.userId]);
    res.json({ ok: true, message: 'MFA disabled' });
  } catch (err) {
    console.error('MFA disable error:', err);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

hubAuthRouter.post('/logout', async (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

hubAuthRouter.get('/me', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { rows } = await pool.query('SELECT id, username, email_confirmed, mfa_enabled, created_at FROM hub_accounts WHERE id = $1', [req.session.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json({ ok: true, account: rows[0] });
  } catch (err) {
    console.error('Get account error:', err);
    res.status(500).json({ error: 'Failed to get account' });
  }
});
