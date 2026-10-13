import { buildCompletionReceipt } from '../server/memory/tasks.js';

describe('agent task completion receipts', () => {
  test('captures compact changed, landed, and verify sections', () => {
    const receipt = buildCompletionReceipt(
      {
        id: 'task-1',
        title: 'Add receipt flow',
        project: 'Demo',
        prompt: 'Handoff file: C:\\Projects\\Demo\\.team\\handoffs\\receipt.md',
      },
      {
        status: 'completed',
        result: [
          '## Summary of Changes',
          '- Added completion receipt storage.',
          '- Surfaced receipts in Live Operations.',
          '',
          '## Where It Landed',
          '- server/memory/tasks.js',
          '- src/components/operations/TaskQueuePanel.jsx',
          '',
          '## Verification Steps',
          '- Run npm test.',
          '- Open Live Operations and check the Completion Receipts panel.',
        ].join('\n'),
      }
    );

    expect(receipt.source).toBe('handoff');
    expect(receipt.summary).toEqual([
      'Added completion receipt storage.',
      'Surfaced receipts in Live Operations.',
    ]);
    expect(receipt.landed).toEqual(expect.arrayContaining([
      'Handoff: C:\\Projects\\Demo\\.team\\handoffs\\receipt.md',
      'Project: Demo',
      'server/memory/tasks.js',
      'src/components/operations/TaskQueuePanel.jsx',
    ]));
    expect(receipt.verify).toEqual([
      'Run npm test.',
      'Open Live Operations and check the Completion Receipts panel.',
    ]);
  });

  test('falls back for failed tasks without a structured result', () => {
    const receipt = buildCompletionReceipt(
      { id: 'task-2', title: 'Broken task', prompt: '' },
      { status: 'failed', error: 'Model timed out' }
    );

    expect(receipt.status).toBe('failed');
    expect(receipt.summary).toEqual(['Model timed out']);
    expect(receipt.verify).toEqual(['Review the error, fix the blocker, then re-run the task.']);
  });
});
