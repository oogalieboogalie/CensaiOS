import { isRowId, loggedId } from '../server/routes/agents/groupOwner.js';
import { noteGroupIdColumns } from '../server/boot/groupIdColumns.js';

const fakeClient = (rows) => ({ query: async () => ({ rows }) });
const fakeLog = () => {
  const lines = [];
  return { lines, warn: (message, meta) => lines.push({ message, meta }), info: () => {} };
};

describe('group row ids', () => {
  test('a UUID or a plain whole number can be a row id', () => {
    expect(isRowId('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isRowId('42')).toBe(true);
  });

  test('anything else is refused and logged as not-an-id', () => {
    for (const value of ['0', '-3', '4.5', '012', 'pat@example.com', '1; drop table', '', undefined]) {
      expect(isRowId(value)).toBe(false);
      expect(loggedId(value)).toBe('not-an-id');
    }
  });
});

describe('the db-setup start check', () => {
  test('says nothing when both group id columns are uuids', async () => {
    const log = fakeLog();
    await noteGroupIdColumns(fakeClient([
      { table_name: 'group_goals', data_type: 'uuid' },
      { table_name: 'group_milestones', data_type: 'uuid' },
    ]), log);
    expect(log.lines).toEqual([]);
  });

  test('names the table and column type once when they are not', async () => {
    const log = fakeLog();
    await noteGroupIdColumns(fakeClient([
      { table_name: 'group_milestones', data_type: 'integer' },
      { table_name: 'group_goals', data_type: 'bigint' },
    ]), log);
    expect(log.lines).toEqual([{
      message: 'group goal ids are not uuid columns',
      meta: { columns: 'group_goals.id bigint, group_milestones.id integer' },
    }]);
  });

  test('a failed check never stops the start and logs a short code only', async () => {
    const log = fakeLog();
    const broken = { query: async () => { throw Object.assign(new Error('permission denied for Pat'), { code: '42501' }); } };
    await expect(noteGroupIdColumns(broken, log)).resolves.toBeNull();
    expect(log.lines).toEqual([{ message: 'group goal id check skipped', meta: { code: '42501' } }]);
  });
});
