// server/shareLinks/agentReplies.js
//
// @agent mentions in comment threads: the agent answers in the thread with
// the board owner's model keys, charged to the share link's token budget.

import { createLogger } from '../logger.js';
import { MAX_BODY, broadcastComment } from './comments.js';
import { chargeAgentBudget, insertComment, linkHasAgentBudget, listComments } from './store.js';

const AGENT_REPLY_MAX_TOKENS = 400;
const log = createLogger('canvas-comments');

function threadTranscript(rows, rootId) {
  return rows
    .filter((row) => String(row.id) === String(rootId) || String(row.thread_id) === String(rootId))
    .slice(-12)
    .map((row) => `${row.author_name}: ${row.body}`)
    .join('\n');
}

/**
 * Answer @agent mentions in a thread with the board owner's model keys.
 * Guest links spend from their own token budget; members don't have one.
 */
export async function answerAgentMentions(db, {
  workspaceId, root, mentions, link = null, ownerUserId, callModel, createAccessContext,
}) {
  const agents = mentions.filter((mention) => mention.kind === 'agent');
  for (const mention of agents) {
    let body;
    let tokens = 0;
    try {
      if (link && !(await linkHasAgentBudget(db, link.id))) {
        body = 'This share link has used up its agent budget, so I can\'t answer here. The board owner can raise the budget in Share.';
      } else {
        const { rows: agentRows } = await db.query(
          'SELECT id, name, role, personality, system_prompt, model_provider, model_name FROM agents WHERE id = $1',
          [mention.id],
        );
        const agent = agentRows[0];
        if (!agent) continue;
        const rows = await listComments(db, { workspaceId });
        const system = [
          agent.system_prompt || `You are ${agent.name}${agent.role ? `, ${agent.role}` : ''}.`,
          'You are answering in a comment thread pinned on a shared canvas board.',
          'Reply in plain text, under 120 words. You cannot change the board or run tools here.',
        ].join('\n');
        const data = await callModel({
          accessContext: createAccessContext({ userId: String(ownerUserId), workspaceId, source: 'canvas-comments' }),
          modelProvider: agent.model_provider || null,
          modelName: agent.model_name || null,
          body: {
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: threadTranscript(rows, root.id) },
            ],
            max_tokens: AGENT_REPLY_MAX_TOKENS,
            temperature: 0.4,
          },
          timeoutMs: 60000,
          logContext: { source: 'canvas-comments' },
        });
        body = String(data?.choices?.[0]?.message?.content || '').trim() || 'I don\'t have an answer for that yet.';
        tokens = Number(data?.usage?.total_tokens) || Math.ceil((system.length + body.length) / 4);
      }
    } catch (error) {
      log.warn('agent comment reply failed', { workspaceId, agentId: mention.id, error: error.message });
      body = 'I couldn\'t reach my model just now. The board owner may need to add a model key.';
    }
    if (link && tokens) await chargeAgentBudget(db, link.id, tokens);
    const reply = await insertComment(db, {
      workspaceId,
      threadId: root.id,
      linkId: link?.id || null,
      authorKind: 'agent',
      authorId: mention.id,
      authorName: mention.name,
      authorColor: null,
      body: body.slice(0, MAX_BODY),
      mentions: [],
    });
    await broadcastComment(workspaceId, reply, root);
  }
}
