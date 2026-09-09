import express from 'express';
import { google } from 'googleapis';
import crypto from 'crypto';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { getClientAccessPolicy } from '../security/byokPolicy.js';
import { saveOAuthCredential } from '../credentials/oauthStore.js';
import rateLimiter from '../middleware/rateLimiter.js';
import {
  findOrCreateAuthorizedUser,
  isDeveloperLoginAllowed,
  isSessionAuthorized,
} from '../security/authPolicy.js';
import { establishAuthenticatedSession } from '../security/authSession.js';
import { authSecurityRateLimiter } from '../middleware/standardRateLimits.js';

export const authRouter = express.Router();

const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:5173';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
  process.env.G_CLIENT_ID,
  process.env.G_SECRET,
  GOOGLE_REDIRECT_URI
);

authRouter.get('/google', authSecurityRateLimiter, rateLimiter, (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauth_state = state;

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Get refresh token
    prompt: 'select_account consent', // Avoid stale Google sessions, then request current scopes
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/spreadsheets'
    ],
    state,
  });
  req.session.save((err) => {
    if (err) {
      console.error('Failed to persist Google OAuth state:', err);
      return res.status(500).send('Could not start Google authentication.');
    }
    res.redirect(url);
  });
});

authRouter.get('/google/callback', authSecurityRateLimiter, rateLimiter, async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      delete req.session.oauth_state;
      return res.status(400).send('Google authorization was not completed. Please try again.');
    }
    const sessionState = req.session.oauth_state;
    delete req.session.oauth_state;

    if (!code || !state || state !== sessionState) {
      return res.status(400).send('Invalid or expired Google authentication state.');
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Retrieve email and name using oauth2 API
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    const name = userInfo.data.name;

    if (!email) {
      return res.status(400).send('Could not retrieve email from Google OAuth');
    }

    const access = await findOrCreateAuthorizedUser({ db: pool, email, name });
    if (!access.allowed) {
      return res.status(403).send('Access denied. This private beta requires an invitation.');
    }
    const user = access.user;

    await saveOAuthCredential({
      db: pool,
      userId: user.id,
      provider: 'google',
      tokens,
    });

    await establishAuthenticatedSession(req, user);
    res.redirect(APP_ORIGIN);
  } catch (err) {
    console.error('OAuth Callback Error:', {
      message: err.message,
      code: err.code,
      googleError: err.response?.data?.error,
      googleDescription: err.response?.data?.error_description,
    });
    res.status(500).send('Google authentication failed.');
  }
});

authRouter.post('/developer', authSecurityRateLimiter, rateLimiter, async (req, res) => {
  // The DB schema (users + session tables) is bootstrapped asynchronously during
  // boot. If the first login attempt arrives while probeDb is still running the
  // multi-user SQL, the raw pool.query would throw "relation does not exist" and
  // bubble up as a 500. Mirror the other routes: return a clean 503 so the client
  // knows to retry.
  if (!dbReady()) {
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ error: 'Database initializing, please retry in a moment.' });
  }

  const isOauthConfigured = !!(process.env.G_CLIENT_ID && process.env.G_SECRET);
  if (!isDeveloperLoginAllowed({ oauthConfigured: isOauthConfigured })) {
    return res.status(403).json({ error: 'Developer login is disabled for this deployment.' });
  }

  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const access = await findOrCreateAuthorizedUser({ db: pool, email, name });
    if (!access.allowed) {
      return res.status(403).json({ error: 'Access denied. This private beta requires an invitation.' });
    }
    const user = access.user;
    await establishAuthenticatedSession(req, user);
    res.json({ ok: true, user });
  } catch (err) {
    console.error('Developer login error:', err);
    res.status(500).json({ error: err.message });
  }
});

authRouter.get('/session', async (req, res) => {
  const oauthConfigured = !!(process.env.G_CLIENT_ID && process.env.G_SECRET);
  if (req.session.userId) {
    try {
      const userRes = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [req.session.userId]);
      if (userRes.rows.length > 0) {
        const user = userRes.rows[0];
        if (!isSessionAuthorized({ ...req.session, userEmail: user.email })) {
          delete req.session.userId;
          delete req.session.userRole;
          delete req.session.userEmail;
          return res.json({
            authenticated: false,
            oauthConfigured,
            ...getClientAccessPolicy(null),
          });
        }
        req.session.userRole = user.role;
        req.session.userEmail = user.email;
        return res.json({
          authenticated: true,
          user,
          oauthConfigured,
          ...getClientAccessPolicy(user.role),
        });
      }
    } catch (err) {
      console.error('Session user fetch error:', err);
    }
  }
  res.json({
    authenticated: false,
    oauthConfigured,
    ...getClientAccessPolicy(null),
  });
});

authRouter.post('/logout', authSecurityRateLimiter, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Failed to destroy session:', err);
      return res.status(500).send('Could not log out.');
    }
    res.clearCookie('connect.sid');
    res.json({ authenticated: false, message: 'Logged out successfully' });
  });
});
