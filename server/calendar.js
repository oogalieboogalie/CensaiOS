import { google } from 'googleapis';
import express from 'express';
import pool from './db.js';
import { dbReady } from './dbState.js';
import { getOAuthCredential } from './credentials/oauthStore.js';

export const calendarRouter = express.Router();

const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';

export async function getOAuthClient(userId) {
  if (!dbReady()) return null;
  const oauth2Client = new google.auth.OAuth2(
    process.env.G_CLIENT_ID,
    process.env.G_SECRET,
    GOOGLE_REDIRECT_URI
  );
  try {
    const tokens = await getOAuthCredential({
      db: pool,
      userId,
      provider: 'google',
    });
    if (!tokens) return null;
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
  } catch (err) {
    console.error('Failed to load OAuth credentials from database for user:', userId, err);
    return null;
  }
}

// Internal function to get upcoming events
export async function getCalendarEventsInternal(userId, { start, end } = {}) {
  const auth = await getOAuthClient(userId);
  if (!auth) throw new Error('Not authenticated with Google');

  const calendar = google.calendar({ version: 'v3', auth });

  // Default to a 7 day window if not specified
  let timeMin = new Date().toISOString();
  let timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 7);
  timeMax = timeMax.toISOString();

  if (start) timeMin = new Date(start).toISOString();
  if (end) timeMax = new Date(end).toISOString();

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    maxResults: 50,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const googleColors = {
    '1': '#7986CB', '2': '#33B679', '3': '#8E24AA', '4': '#E67C73',
    '5': '#F6BF26', '6': '#F4511E', '7': '#039BE5', '8': '#616161',
    '9': '#3F51B5', '10': '#0B8043', '11': '#D50000'
  };

  return response.data.items.map(ev => ({
    id: ev.id,
    title: ev.summary || 'Untitled Event',
    description: ev.description || '',
    start: ev.start.dateTime || ev.start.date,
    end: ev.end.dateTime || ev.end.date,
    link: ev.htmlLink,
    color: ev.colorId ? googleColors[ev.colorId] : 'var(--ps-blue)'
  }));
}

// Internal function to add an event
export async function addCalendarEventInternal(userId, { title, start, end, description }) {
  const auth = await getOAuthClient(userId);
  if (!auth) throw new Error('Not authenticated with Google');

  if (!title || !start || !end) {
    throw new Error('Missing title, start, or end in request');
  }

  const calendar = google.calendar({ version: 'v3', auth });

  const event = {
    summary: title,
    description: description || '',
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: new Date(end).toISOString() },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  return { ok: true, eventId: response.data.id, link: response.data.htmlLink };
}

// Get upcoming events
calendarRouter.get('/events', async (req, res) => {
  try {
    const events = await getCalendarEventsInternal(req.session.userId, {
      start: req.query.start,
      end: req.query.end
    });
    res.json(events);
  } catch (err) {
    if (err.message === 'Not authenticated with Google') {
      res.status(401).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Add an event
calendarRouter.post('/add', async (req, res) => {
  try {
    const result = await addCalendarEventInternal(req.session.userId, req.body);
    res.json(result);
  } catch (err) {
    if (err.message === 'Not authenticated with Google') {
      res.status(401).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});
