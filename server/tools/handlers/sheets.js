import { readSheetsInternal, appendSheetsInternal, updateSheetsInternal } from '../../sheets.js';

export async function handleSheetsTool(agentId, name, args, context = {}) {
  const userId = context.userId;
  switch (name) {
    case 'sheets_read_range': {
      const data = await readSheetsInternal(userId, args);
      return JSON.stringify(data.values, null, 2);
    }
    case 'sheets_append_row': {
      const data = await appendSheetsInternal(userId, args);
      return `Successfully appended row. Updated Range: ${data.updatedRange}`;
    }
    case 'sheets_update_cell': {
      const data = await updateSheetsInternal(userId, args);
      return `Successfully updated cell. Cells updated: ${data.updatedCells}`;
    }
    default:
      throw new Error(`Unknown Sheets tool: ${name}`);
  }
}
