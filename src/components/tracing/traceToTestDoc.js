// Turns one agent trace into a plain test-steps document: what the agent was
// asked, each round and tool call in order, and what passing looks like.
// Opened as a Document window so the user (or an agent) can rerun it by hand.

function toolLine(payload = {}) {
  const name = payload.toolName ? `\`${payload.toolName}\`` : 'a tool';
  if (payload.private) return `Calls ${name} (private, details redacted).`;
  const ok = payload.ok ? 'succeeds' : 'FAILED in the recorded run';
  return `Calls ${name}; it ${ok}${payload.resultType ? ` and returns a ${payload.resultType} result` : ''}.`;
}

function stepLine(event = {}) {
  const p = event.payload || {};
  if (event.event_type === 'agent.round') {
    return `Round ${p.round ?? '?'}: the agent thinks with ${p.modelConfig?.model || 'its model'} (${p.toolsAvailableCount ?? 0} tools available).`;
  }
  if (event.event_type === 'tool.invocation') return toolLine(p);
  if (event.event_type === 'session.failure') {
    return `The run fails: ${p.failure || 'execution failed'}${p.toolName ? ` (in \`${p.toolName}\`)` : ''}.`;
  }
  return `${event.event_type || 'event'}.`;
}

export function traceToTestMarkdown(trace = {}, events = []) {
  const data = trace.data || {};
  const failed = data.status === 'failed' || events.some((e) => e.event_type === 'session.failure');
  const tools = events.filter((e) => e.event_type === 'tool.invocation' && !e.payload?.private);
  const lines = [
    `# Test: ${trace.title || 'Agent run'}`,
    '',
    `From trace ${trace.id || ''}${trace.created_at ? `, recorded ${new Date(trace.created_at).toLocaleString()}` : ''}.`,
    `Agent: ${data.agentId || 'unknown'}${data.windowId ? ` · Window: ${data.windowId}` : ''}`,
    '',
    '## Setup',
    '',
    `1. Open the same agent (${data.agentId || 'the agent from this trace'}) on a board.`,
    '2. Give it the same request as the recorded run (the first message in its chat).',
    '',
    '## Recorded steps',
    '',
    ...(events.length ? events.map((e, i) => `${i + 1}. ${stepLine(e)}`) : ['No steps were recorded.']),
    '',
    '## Passes when',
    '',
    ...(tools.length ? [`- The agent calls ${[...new Set(tools.map((e) => `\`${e.payload.toolName}\``))].join(', ')}.`] : []),
    '- Every tool call succeeds.',
    '- The run ends with an answer and no failure.',
  ];
  if (failed) lines.push('', 'The recorded run failed, so this test fails until that problem is fixed.');
  return `${lines.join('\n')}\n`;
}
