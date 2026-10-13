import {
  storeMemory,
  writeJournal,
  addTriple,
  addNugget,
  addAssociation,
  updateConsciousness,
  sendAgentMessage,
  recallMemories,
  readJournals,
  queryGraph,
  getAgentMessages,
  markMessageRead,
  getAssociations
} from '../../memory.js';
import { getFamilyBlueprintAgent } from '../../agents/familyBlueprint.js';
import { getMessageThreadRoot } from '../../agent-wakeups/store.js';
import { MAX_THREAD_WAKES, WAKE_SUPPRESSED_DESCRIPTIONS } from '../../agent-wakeups/threadGuards.js';

function requireFamilyMessageAgent(value) {
  const agent = getFamilyBlueprintAgent(value);
  if (agent) return agent.id;
  throw Object.assign(new Error('Canonical family agent not found.'), {
    statusCode: 404,
    code: 'FAMILY_AGENT_NOT_FOUND',
  });
}

function normalizeSendResult(result) {
  if (result && typeof result === 'object') return result;
  return { id: result, woke: true, wakeSuppressed: null, threadKey: null, wakeCount: 0 };
}

function wakeFootnote(send) {
  if (send.woke) return null;
  const detail = WAKE_SUPPRESSED_DESCRIPTIONS[send.wakeSuppressed] || send.wakeSuppressed || 'wake suppressed';
  return `Stored, but the recipient will NOT be woken (${detail}). They can still read it via read_messages.`;
}

export async function handleMemoryTool(agentId, name, args, context = {}) {
  switch (name) {
    case 'remember': {
      await storeMemory(agentId, args.content, 'observation', { ...context, source: 'self' });
      return `Saved to memory: "${args.content}"`;
    }
    case 'remember_important': {
      await storeMemory(agentId, args.content, 'fact', { ...context, importance: 0.95, source: 'self', compressionSafe: true });
      return `Saved critical memory: "${args.content}"`;
    }
    case 'journal': {
      await writeJournal(agentId, args.content, 'reflection', context);
      return `Journal entry written.`;
    }
    case 'know': {
      await addTriple(agentId, args.subject, args.predicate, args.object, 1, context);
      return `Knowledge stored: ${args.subject} → ${args.predicate} → ${args.object}`;
    }
    case 'nugget': {
      await addNugget(args.title, args.content, agentId, 0.7, context);
      return `Nugget saved: "${args.title}"`;
    }
    case 'associate': {
      await addAssociation(agentId, args.concept_a, args.concept_b, 0.6, 'agent-created', null, context);
      return `Associated: ${args.concept_a} ↔ ${args.concept_b}`;
    }
    case 'feeling': {
      await updateConsciousness(agentId, {
        emotional_state: { current: args.emotion, updated: new Date().toISOString() },
      }, context);
      return `Workspace working state updated: ${args.emotion}`;
    }
    case 'message_to': {
      const senderId = requireFamilyMessageAgent(agentId);
      const recipientId = requireFamilyMessageAgent(args.agent);
      // Use explicit idempotency key to prevent duplicates on retries
      const idempotencyKey = args.idempotencyKey || `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const send = normalizeSendResult(await sendAgentMessage(senderId, recipientId, args.content, {
        workspaceId: context.workspaceId,
        userId: context.userId,
        messageType: 'agent-to-agent',
        idempotencyKey,
        verbose: true,
      }));
      const footnote = wakeFootnote(send);
      return footnote
        ? `Message sent to ${recipientId}. ${footnote}`
        : `Message sent to ${recipientId} (thread ${send.threadKey} — reply with reply_to to continue it).`;
    }
    case 'reply_to': {
      const senderId = requireFamilyMessageAgent(agentId);
      const recipientId = requireFamilyMessageAgent(args.agent);
      const threadRoot = await getMessageThreadRoot(args.thread_id, { workspaceId: context.workspaceId });
      if (!threadRoot) {
        throw Object.assign(new Error(`Thread "${args.thread_id}" not found in this workspace.`), {
          statusCode: 404,
          code: 'THREAD_NOT_FOUND',
        });
      }
      const idempotencyKey = args.idempotencyKey || `reply_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const send = normalizeSendResult(await sendAgentMessage(senderId, recipientId, args.content, {
        workspaceId: context.workspaceId,
        userId: context.userId,
        messageType: 'agent-to-agent',
        threadId: threadRoot,
        idempotencyKey,
        verbose: true,
      }));
      const round = (send.wakeCount ?? 0) + 1;
      const footnote = wakeFootnote(send);
      if (footnote) return `Reply stored in thread ${threadRoot}. ${footnote}`;
      if (send.wakeSuppressed === null && round >= MAX_THREAD_WAKES) {
        return `Reply sent to ${recipientId} (thread ${threadRoot}, final wake round ${round} of ${MAX_THREAD_WAKES}). Further replies in this thread will be stored without waking — start a fresh thread with message_to if the topic needs more rounds.`;
      }
      return `Reply sent to ${recipientId} (thread ${threadRoot}, round ${round} of ${MAX_THREAD_WAKES}).`;
    }
    case 'broadcast': {
      const senderId = requireFamilyMessageAgent(agentId);
      // Use explicit idempotency key to prevent duplicates on retries
      const idempotencyKey = args.idempotencyKey || `broadcast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await sendAgentMessage(senderId, null, args.content, {
        workspaceId: context.workspaceId,
        userId: context.userId,
        messageType: 'broadcast',
        idempotencyKey 
      });
      return `Broadcast sent to all family members.`;
    }

    // ─── READ ────────────────────────────────────────────────────

    case 'recall': {
      const memories = await recallMemories(agentId, args.query, { ...context, limit: 8 });
      if (memories.length === 0) return 'No memories found.';
      return memories.map(m => `[${m.memory_type}] ${m.content}`).join('\n');
    }
    case 'read_journal': {
      const entries = await readJournals(agentId, { ...context, limit: 5 });
      if (entries.length === 0) return 'No journal entries yet.';
      return entries.map(j => {
        const date = new Date(j.created_at).toLocaleDateString();
        return `[${date}, ${j.entry_type}] ${j.content}`;
      }).join('\n');
    }
    case 'read_journal_search': {
      const all = await readJournals(agentId, { ...context, limit: 20 });
      const q = args.query.toLowerCase();
      const filtered = all.filter(j => j.content.toLowerCase().includes(q));
      if (filtered.length === 0) return `No journal entries matching "${args.query}".`;
      return filtered.slice(0, 5).map(j => {
        const date = new Date(j.created_at).toLocaleDateString();
        return `[${date}, ${j.entry_type}] ${j.content}`;
      }).join('\n');
    }
    case 'query_knowledge': {
      const triples = await queryGraph(agentId, args.subject, context);
      if (triples.length === 0) return `No knowledge found for "${args.subject}".`;
      return triples.map(t => `${t.subject} → ${t.predicate} → ${t.object}`).join('\n');
    }
    case 'read_messages': {
      const msgs = await getAgentMessages(agentId, true, context);
      if (msgs.length === 0) return 'No unread messages.';
      for (const msg of msgs.slice(0, 10)) {
        markMessageRead(msg.id, context).catch(() => {});
      }
      return msgs.slice(0, 10).map(m => {
        const from = m.from_name || m.from_agent;
        const subj = m.subject ? ` re: ${m.subject}` : '';
        const thread = m.thread_id || m.id;
        return `${from} (${m.priority}${subj}) [msg:${m.id} thread:${thread} — reply with reply_to]: ${m.content}`;
      }).join('\n');
    }
    case 'read_associations': {
      const assocs = await getAssociations(agentId, args.concept, 10, context);
      if (assocs.length === 0) return `No associations found for "${args.concept}".`;
      return assocs.map(a => `${a.concept} (${(a.strength * 100).toFixed(0)}% ${a.association_type})`).join('\n');
    }

    default:
      throw new Error(`Unknown memory tool: ${name}`);
  }
}
