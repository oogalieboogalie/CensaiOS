import { jest } from '@jest/globals';

// Mock DB pool
jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: jest.fn() },
}));

// Mock googleapis
const mockList = jest.fn();
const mockInsert = jest.fn();
const mockGet = jest.fn();
const mockAppend = jest.fn();
const mockUpdate = jest.fn();

jest.unstable_mockModule('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    calendar: jest.fn().mockReturnValue({
      events: {
        list: mockList,
        insert: mockInsert,
      },
    }),
    sheets: jest.fn().mockReturnValue({
      spreadsheets: {
        values: {
          get: mockGet,
          append: mockAppend,
          update: mockUpdate,
        },
      },
    }),
  },
}));

// Import modules under test after mocking
const { default: pool } = await import('../server/db.js');
const {
  getOAuthClient,
  getCalendarEventsInternal,
  addCalendarEventInternal
} = await import('../server/calendar.js');
const {
  readSheetsInternal,
  appendSheetsInternal,
  updateSheetsInternal
} = await import('../server/sheets.js');
const { handleCalendarTool } = await import('../server/tools/handlers/calendar.js');
const { handleSheetsTool } = await import('../server/tools/handlers/sheets.js');
const { setDbReady } = await import('../server/dbState.js');

describe('Google Calendar & Sheets backend integrations and tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setDbReady(true);
  });

  describe('getOAuthClient token retrieval', () => {
    test('retrieves token by user_id when provided', async () => {
      pool.query.mockResolvedValue({
        rows: [{
          access_token: 'user-access',
          refresh_token: 'user-refresh',
          expiry_date: 1234567,
          scope: 'some-scope'
        }]
      });

      const client = await getOAuthClient('user-123');
      expect(client).toBeDefined();
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $1'),
        ['user-123', 'google']
      );
    });

    test('falls back to the first available Google token when no user_id is provided', async () => {
      pool.query.mockResolvedValue({
        rows: [{
          access_token: 'fallback-access',
          refresh_token: 'fallback-refresh',
          expiry_date: 9876543,
          scope: 'fallback-scope'
        }]
      });

      const client = await getOAuthClient(undefined);
      expect(client).toBeDefined();
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('provider = $1 ORDER BY updated_at DESC LIMIT 1'),
        ['google']
      );
    });

    test('returns null if no token is found', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      const client = await getOAuthClient('user-empty');
      expect(client).toBeNull();
    });
  });

  describe('getCalendarEventsInternal', () => {
    test('lists upcoming calendar events and colors them', async () => {
      pool.query.mockResolvedValue({
        rows: [{ access_token: 'tok', refresh_token: 'ref', expiry_date: 123, scope: 'scope' }]
      });

      mockList.mockResolvedValue({
        data: {
          items: [
            {
              id: 'ev-1',
              summary: 'Test Meeting',
              description: 'Checking integration',
              start: { dateTime: '2026-06-16T10:00:00Z' },
              end: { dateTime: '2026-06-16T11:00:00Z' },
              htmlLink: 'https://calendar.google.com/event1',
              colorId: '2'
            }
          ]
        }
      });

      const events = await getCalendarEventsInternal('user-123', {
        start: '2026-06-16T00:00:00Z',
        end: '2026-06-23T23:59:59Z'
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        id: 'ev-1',
        title: 'Test Meeting',
        description: 'Checking integration',
        start: '2026-06-16T10:00:00Z',
        end: '2026-06-16T11:00:00Z',
        link: 'https://calendar.google.com/event1',
        color: '#33B679' // colorId 2 mapped
      });
    });
  });

  describe('addCalendarEventInternal', () => {
    test('inserts a new calendar event', async () => {
      pool.query.mockResolvedValue({
        rows: [{ access_token: 'tok', refresh_token: 'ref' }]
      });

      mockInsert.mockResolvedValue({
        data: {
          id: 'new-ev-123',
          htmlLink: 'https://calendar.google.com/eventnew'
        }
      });

      const result = await addCalendarEventInternal('user-123', {
        title: 'Lunch',
        start: '2026-06-16T12:00:00Z',
        end: '2026-06-16T13:00:00Z',
        description: 'Yum'
      });

      expect(result).toEqual({
        ok: true,
        eventId: 'new-ev-123',
        link: 'https://calendar.google.com/eventnew'
      });
    });
  });

  describe('readSheetsInternal', () => {
    test('fetches values from Google Sheets', async () => {
      pool.query.mockResolvedValue({
        rows: [{ access_token: 'tok' }]
      });

      mockGet.mockResolvedValue({
        data: {
          values: [['Col1', 'Col2'], ['Val1', 'Val2']]
        }
      });

      const result = await readSheetsInternal('user-123', {
        spreadsheet_id: 'sheet-abc',
        range: 'A1:B2'
      });

      expect(result.values).toEqual([['Col1', 'Col2'], ['Val1', 'Val2']]);
    });
  });

  describe('appendSheetsInternal', () => {
    test('appends a row to Google Sheets', async () => {
      pool.query.mockResolvedValue({
        rows: [{ access_token: 'tok' }]
      });

      mockAppend.mockResolvedValue({
        data: {
          updates: {
            updatedRange: 'Sheet1!A3:B3'
          }
        }
      });

      const result = await appendSheetsInternal('user-123', {
        spreadsheet_id: 'sheet-abc',
        range: 'Sheet1!A1',
        values: ['NewVal1', 'NewVal2']
      });

      expect(result).toEqual({
        ok: true,
        updatedRange: 'Sheet1!A3:B3'
      });
    });
  });

  describe('updateSheetsInternal', () => {
    test('updates cells in Google Sheets', async () => {
      pool.query.mockResolvedValue({
        rows: [{ access_token: 'tok' }]
      });

      mockUpdate.mockResolvedValue({
        data: {
          updatedCells: 1
        }
      });

      const result = await updateSheetsInternal('user-123', {
        spreadsheet_id: 'sheet-abc',
        range: 'Sheet1!C3',
        value: 'UpdatedVal'
      });

      expect(result).toEqual({
        ok: true,
        updatedCells: 1
      });
    });
  });

  describe('handleCalendarTool', () => {
    test('read_calendar invokes getCalendarEventsInternal and returns JSON string', async () => {
      pool.query.mockResolvedValue({
        rows: [{ access_token: 'tok' }]
      });

      mockList.mockResolvedValue({
        data: { items: [] }
      });

      const resultStr = await handleCalendarTool('agent-1', 'read_calendar', {}, { userId: 'user-123' });
      const resultObj = JSON.parse(resultStr);
      expect(Array.isArray(resultObj)).toBe(true);
    });

    test('add_calendar_event invokes addCalendarEventInternal', async () => {
      pool.query.mockResolvedValue({
        rows: [{ access_token: 'tok' }]
      });

      mockInsert.mockResolvedValue({
        data: { id: 'ev-999', htmlLink: 'http://link' }
      });

      const resultStr = await handleCalendarTool('agent-1', 'add_calendar_event', {
        title: 'Meeting',
        start: '2026-06-16T15:00:00Z',
        end: '2026-06-16T16:00:00Z'
      }, { userId: 'user-123' });

      const resultObj = JSON.parse(resultStr);
      expect(resultObj.ok).toBe(true);
      expect(resultObj.eventId).toBe('ev-999');
    });
  });

  describe('handleSheetsTool', () => {
    test('sheets_read_range returns sheet rows', async () => {
      pool.query.mockResolvedValue({
        rows: [{ access_token: 'tok' }]
      });

      mockGet.mockResolvedValue({
        data: { values: [['1', '2']] }
      });

      const resultStr = await handleSheetsTool('agent-1', 'sheets_read_range', {
        spreadsheet_id: 'abc',
        range: 'A1'
      }, { userId: 'user-123' });

      const resultObj = JSON.parse(resultStr);
      expect(resultObj).toEqual([['1', '2']]);
    });

    test('sheets_append_row calls append', async () => {
      pool.query.mockResolvedValue({
        rows: [{ access_token: 'tok' }]
      });

      mockAppend.mockResolvedValue({
        data: { updates: { updatedRange: 'R1' } }
      });

      const resultStr = await handleSheetsTool('agent-1', 'sheets_append_row', {
        spreadsheet_id: 'abc',
        range: 'Sheet1!A1',
        values: ['a']
      }, { userId: 'user-123' });

      expect(resultStr).toContain('Successfully appended row');
    });

    test('sheets_update_cell calls update', async () => {
      pool.query.mockResolvedValue({
        rows: [{ access_token: 'tok' }]
      });

      mockUpdate.mockResolvedValue({
        data: { updatedCells: 5 }
      });

      const resultStr = await handleSheetsTool('agent-1', 'sheets_update_cell', {
        spreadsheet_id: 'abc',
        range: 'Sheet1!A1',
        value: 'a'
      }, { userId: 'user-123' });

      expect(resultStr).toContain('Successfully updated cell');
    });
  });
});
