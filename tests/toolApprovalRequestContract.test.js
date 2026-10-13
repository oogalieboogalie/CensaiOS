import { approvalRequestHash, sanitizeApprovalArguments } from '../server/approvals/requestContract.js';

test('request hashes are deterministic and provenance is excluded from captured arguments', () => {
  const first = sanitizeApprovalArguments({ project: 'demo', path: 'a.md', content: 'x',
    __provenance: { prompt: 'private prompt' } });
  const second = sanitizeApprovalArguments({ content: 'x', path: 'a.md', project: 'demo' });
  expect(first).toEqual(second);
  expect(approvalRequestHash({ moduleId: 'project-writer', toolName: 'project_write', args: first }))
    .toBe(approvalRequestHash({ moduleId: 'project-writer', toolName: 'project_write', args: second }));
  expect(JSON.stringify(first)).not.toContain('private prompt');
});

test('request arguments are bounded and must be an object', () => {
  expect(() => sanitizeApprovalArguments([])).toThrow('must be an object');
  expect(() => sanitizeApprovalArguments({ content: 'x'.repeat(70 * 1024) })).toThrow('64 KiB');
});
