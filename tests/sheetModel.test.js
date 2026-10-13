import { addColumn, colLetter, makeSheet, pasteGrid, removeColumn, rowsToFill, setCell, toTsv } from '../src/components/sheets/sheetModel.js';

describe('board sheet model', () => {
  test('column letters', () => {
    expect([0, 1, 25, 26, 27, 701].map(colLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'ZZ']);
  });

  test('paste fills down and across, adding rows as needed', () => {
    const sheet = makeSheet({ columns: ['Company', 'Notes'], rows: 2 });
    const next = pasteGrid(sheet, 'r1', 'c0', 'Acme\tRobots\nGlobex\tChemicals\nInitech\tSoftware\n');
    expect(next.rows).toHaveLength(4);
    expect(next.rows[1].cells.c0.v).toBe('Acme');
    expect(next.rows[1].cells.c1.v).toBe('Robots');
    expect(next.rows[3].cells.c0.v).toBe('Initech');
  });

  test('a research column fills rows that have a lookup value and no answer yet', () => {
    let sheet = pasteGrid(makeSheet({ rows: 4 }), 'r0', 'c0', 'Acme\nGlobex\n\nInitech');
    sheet = addColumn(sheet, { name: 'HQ', research: { prompt: 'HQ city', from: 'c0' } });
    const col = sheet.columns[2];
    expect(col.research).toEqual({ prompt: 'HQ city', from: 'c0' });
    sheet = setCell(sheet, 'r1', col.id, { v: 'Springfield' });
    expect(rowsToFill(sheet, col).map((r) => r.id)).toEqual(['r0', 'r3']);
    expect(rowsToFill(sheet, col, { overwrite: true })).toHaveLength(3);
    expect(toTsv(sheet).split('\n')).toEqual(['Company\tNotes\tHQ', 'Acme\t\t', 'Globex\t\tSpringfield', 'Initech\t\t']);
    expect(removeColumn(sheet, col.id).rows[1].cells[col.id]).toBeUndefined();
  });
});
