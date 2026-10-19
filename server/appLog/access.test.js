import { canReadAppLog as realCanRead } from './access.js';

describe('canReadAppLog', () => {
  const db = (role) => ({ query: async () => ({ rows: role ? [{ role }] : [] }) });
  test('owner always, everyday accounts on the PC board, nobody else', async () => {
    expect(await realCanRead(1, { db: db('admin'), mode: 'cloud_saas' })).toBe(true);
    expect(await realCanRead(2, { db: db('user'), mode: 'local_desktop' })).toBe(true);
    expect(await realCanRead(2, { db: db('user'), mode: 'private_server' })).toBe(false);
    expect(await realCanRead(3, { db: db('viewer'), mode: 'local_desktop' })).toBe(false);
    expect(await realCanRead(undefined, { db: db('admin') })).toBe(false);
  });
});
