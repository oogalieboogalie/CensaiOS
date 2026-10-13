import { google } from 'googleapis';
import express from 'express';
import { getOAuthClient } from './calendar.js';

export const sheetsRouter = express.Router();

// Internal function to read spreadsheet values
export async function readSheetsInternal(userId, { spreadsheet_id, range }) {
  const auth = await getOAuthClient(userId);
  if (!auth) throw new Error('Not authenticated with Google');

  if (!spreadsheet_id || !range) {
    throw new Error('Missing spreadsheet_id or range in request');
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheet_id,
    range,
  });
  return { values: response.data.values || [] };
}

// Internal function to append a row of values
export async function appendSheetsInternal(userId, { spreadsheet_id, range, values }) {
  const auth = await getOAuthClient(userId);
  if (!auth) throw new Error('Not authenticated with Google');

  if (!spreadsheet_id || !range || !values) {
    throw new Error('Missing spreadsheet_id, range, or values in request');
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheet_id,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [values],
    },
  });
  return { ok: true, updatedRange: response.data.updates?.updatedRange };
}

// Internal function to update a specific cell or range
export async function updateSheetsInternal(userId, { spreadsheet_id, range, value }) {
  const auth = await getOAuthClient(userId);
  if (!auth) throw new Error('Not authenticated with Google');

  if (!spreadsheet_id || !range || value === undefined) {
    throw new Error('Missing spreadsheet_id, range, or value in request');
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheet_id,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [[value]],
    },
  });
  return { ok: true, updatedCells: response.data.updatedCells };
}

// Read spreadsheet values
sheetsRouter.get('/read', async (req, res) => {
  try {
    const result = await readSheetsInternal(req.session.userId, req.query);
    res.json(result);
  } catch (err) {
    if (err.message === 'Not authenticated with Google') {
      res.status(401).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Append a row of values
sheetsRouter.post('/append', async (req, res) => {
  try {
    const result = await appendSheetsInternal(req.session.userId, req.body);
    res.json(result);
  } catch (err) {
    if (err.message === 'Not authenticated with Google') {
      res.status(401).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Update a specific cell or range
sheetsRouter.post('/update', async (req, res) => {
  try {
    const result = await updateSheetsInternal(req.session.userId, req.body);
    res.json(result);
  } catch (err) {
    if (err.message === 'Not authenticated with Google') {
      res.status(401).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});
