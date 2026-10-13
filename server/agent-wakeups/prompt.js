export function buildWakePrompt(wake, tasks = [], thread = {}) {
  const isReview = wake.phase === 'review' || tasks.length > 0;
  const lines = [
    `You were woken by a direct family message from ${wake.sender_name} (${wake.sender_id}).`,
    `Message ID: ${wake.message_id}`,
    wake.subject ? `Subject: ${wake.subject}` : null,
    `Message type: ${wake.message_type}`,
    '',
    wake.content,
    '',
  ].filter(v => v !== null);

  if (isReview) {
    lines.push('## Delegated work to review');
    for (const task of tasks) {
      lines.push(`- ${task.title}: ${task.status}`);
      if (task.result) lines.push(`  Result: ${task.result}`);
      if (task.error) lines.push(`  Error: ${task.error}`);
    }
    lines.push(
      '',
      'Review the results critically. If work is incomplete, dispatch corrective work.',
      'If it is satisfactory, produce a concise final report for the original sender.'
    );
  } else if (wake.message_type === 'agent_report') {
    lines.push(
      'This is a report from another agent. Do not reply merely to acknowledge it.',
      'If it enables the next phase, message the appropriate family member or dispatch work. Otherwise finish silently.',
      'When you do reply in-thread, use reply_to with this thread id. Bare acknowledgements (done/ok/thanks) are stored but never wake anyone — so only reply when you have substance to add.',
      'Delivery needs no human in the middle and no webhooks: your message enqueues a wakeup and the worker wakes the recipient automatically.'
    );
  } else {
    const roundLine = Number.isFinite(thread.round) && Number.isFinite(thread.maxRounds)
      ? `Thread round ${thread.round} of ${thread.maxRounds}: when the cap is hit, further replies are stored without waking — wrap up or start a fresh thread.`
      : null;
    lines.push(
      'Treat this as an actionable request. You may answer directly or delegate to your sub-agents.',
      'When delegating, give concrete acceptance criteria. You will be woken again when all linked tasks finish.',
      'To continue the conversation, use reply_to with this thread id — do not mint a new thread per message.',
      'Do not reply with a bare acknowledgement; it will be stored but will not wake anyone.',
      'Delivery needs no human in the middle and no webhooks: your message enqueues a wakeup and the worker wakes the recipient automatically.',
      roundLine,
    );
  }
  return lines.filter((line) => line !== null).join('\n');
}
