import { buildToolSynthesisPrompt, summarizeToolActions } from '../server/routes/chat/prompts.js';

test('fallback summary never calls a pending approval completed work', () => {
  const actions = [{
    tool: 'project_write', ok: false,
    result_preview: 'APPROVAL_REQUIRED: approval-1 is pending. No action was executed.',
  }];
  expect(summarizeToolActions(actions)).toMatch(/^No requested action completed/);
  expect(summarizeToolActions(actions)).toContain('APPROVAL_REQUIRED');
});

test('synthesis instruction requires an explicit pending and unexecuted disclosure', () => {
  expect(buildToolSynthesisPrompt([{ tool: 'project_write', result_preview: 'APPROVAL_REQUIRED' }]))
    .toMatch(/pending human approval and was not executed/);
});
