// The Compare and price recipe: items in, a board spreadsheet out with one
// row per item and a Research column per criterion plus a best-price column.
// The sheet runs its own Research columns on open (only in the browser of
// the person who asked), so the comparison fills in live for everyone.

import { addColumn, makeSheet, pasteGrid } from '../../sheets/sheetModel.js';

export const DEFAULT_CRITERIA = ['key ingredients', 'health notes'];

/** "A and B vs C, D" -> ["A", "B", "C", "D"] */
export function splitItems(text) {
  return [...new Set(String(text || '')
    .split(/\s*(?:\n|,|;|\bvs\.?\b|\bversus\b|\band\b|\bor\b)\s*/i)
    .map((item) => item.trim()).filter(Boolean))].slice(0, 30);
}

export function splitCriteria(text) {
  const list = String(text || '').split(/\s*[,;\n]\s*/).map((c) => c.trim()).filter(Boolean);
  return (list.length ? list : DEFAULT_CRITERIA).slice(0, 6);
}

/**
 * @returns {{ sheet, title }} props for a `sheets` window
 */
export function compareSheet({ items, criteria, place = '', runBy = null }) {
  const list = splitItems(items);
  if (list.length < 2) throw new Error('List at least two things to compare, for example “oat milk and almond milk vs soy milk”.');
  let sheet = makeSheet({ columns: ['Item'], rows: list.length });
  sheet = pasteGrid(sheet, sheet.rows[0].id, sheet.columns[0].id, list.join('\n'));
  const from = sheet.columns[0].id;
  const where = String(place || '').trim();
  sheet = addColumn(sheet, {
    name: 'Best price · store',
    research: { prompt: `lowest current price and the store that sells it${where ? ` near ${where}` : ''}; answer as "$price at Store"`, from },
  });
  for (const criterion of splitCriteria(criteria)) sheet = addColumn(sheet, { name: criterion, research: { prompt: criterion, from } });
  const autoRun = sheet.columns.filter((c) => c.research).map((c) => c.id);
  return {
    title: `Compare: ${list.slice(0, 3).join(', ')}${list.length > 3 ? '…' : ''}`.slice(0, 80),
    sheet: { ...sheet, autoRun, autoRunBy: runBy },
  };
}
