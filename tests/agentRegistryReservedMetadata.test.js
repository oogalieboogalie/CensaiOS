import {
  sanitizeUserCardMetadata,
  sanitizeUserCardPatch,
} from '../server/agent-registry/reservedMetadata.js';

describe('Agent Registry reserved metadata', () => {
  test('prevents user-published cards from forging import or executor authority', () => {
    expect(sanitizeUserCardMetadata({
      label: 'kept', import: { kind: 'a2a' }, executor: { kind: 'a2a' },
    })).toEqual({ label: 'kept' });
    const original = { name: 'Updated', metadata: { executor: { kind: 'a2a' }, note: 'kept' } };
    expect(sanitizeUserCardPatch(original)).toEqual({
      name: 'Updated', metadata: { note: 'kept' },
    });
    expect(original.metadata).toHaveProperty('executor');
  });
});
