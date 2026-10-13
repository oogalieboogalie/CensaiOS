export const sheetsTools = [
  {
    type: 'function',
    function: {
      name: 'sheets_read_range',
      description: 'Read a range of cells (e.g. "Sheet1!A1:D20") from a Google Sheet using your Spreadsheet ID.',
      parameters: {
        type: 'object',
        properties: {
          spreadsheet_id: { type: 'string', description: 'The long Spreadsheet ID from the Google Sheet URL.' },
          range: { type: 'string', description: 'The sheet range to read (e.g. "Sheet1!A1:E50", "Prices!A:C").' },
        },
        required: ['spreadsheet_id', 'range'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sheets_append_row',
      description: 'Append a new row of values to a Google Sheet.',
      parameters: {
        type: 'object',
        properties: {
          spreadsheet_id: { type: 'string', description: 'The Spreadsheet ID.' },
          range: { type: 'string', description: 'The sheet range or tab name to append to (e.g. "Sheet1", "Transactions!A1").' },
          values: {
            type: 'array',
            description: 'Array of values for the new row (e.g. ["Item A", "12.50", "Active"]). Each element must be a string.',
            items: { type: 'string' }
          },
        },
        required: ['spreadsheet_id', 'range', 'values'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sheets_update_cell',
      description: 'Update a specific cell value in a Google Sheet.',
      parameters: {
        type: 'object',
        properties: {
          spreadsheet_id: { type: 'string', description: 'The Spreadsheet ID.' },
          range: { type: 'string', description: 'The specific cell to update (e.g. "Sheet1!B5", "Prices!C12").' },
          value: { type: 'string', description: 'The new value to write to the cell.' },
        },
        required: ['spreadsheet_id', 'range', 'value'],
      },
    },
  },
];
