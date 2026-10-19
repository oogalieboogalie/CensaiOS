// Sub-agent data boxes (diagram 15): the scratchpad tools. A main agent reads
// and writes the box of any of its sub-agents; a sub-agent reads and writes
// only its own box (it may leave sub_agent out). Who owns which box is
// decided by pickBox in src/lib/agents/dataBoxes.js.
import { getSubAgents, getSubAgentById, scratchpadWrite, scratchpadRead, scratchpadClear } from '../../memory.js';
import { boxNumbers, boxText, pickBox } from '../../../src/lib/agents/dataBoxes.js';

async function findBox(agentId, asked, context) {
  const children = await getSubAgents(agentId, context);
  const caller = context.workspaceId ? await getSubAgentById(agentId, context) : null;
  const sub = pickBox({ caller, children, asked });
  if (!sub) return { sub: null };
  // The number counts among the sub-agent's brothers and sisters under one main agent.
  const siblings = sub === caller ? await getSubAgents(caller.parent_id, context) : children;
  return { sub, label: `${sub.name}'s data box ${boxNumbers(siblings).get(sub.id) || ''}`.trim() };
}

export async function handleDataBoxTool(agentId, name, args, context = {}) {
  const project = args.project || 'default';
  const { sub, label } = await findBox(agentId, args.sub_agent, context);
  if (!sub) {
    return args.sub_agent
      ? `No sub-agent found matching "${args.sub_agent}". Create one first with create_sub_agent.`
      : 'Say which sub-agent\'s data box to use (sub_agent).';
  }
  if (name === 'scratchpad_write') {
    await scratchpadWrite(sub.id, project, args.key, args.value, context);
    return `Wrote "${args.key}" to ${label} (project: ${project}).`;
  }
  if (name === 'scratchpad_read') {
    const data = await scratchpadRead(sub.id, project, args.key, context);
    if (!data) return `No data found${args.key ? ` for key "${args.key}"` : ''} in ${label}.`;
    if (Array.isArray(data)) return data.length ? boxText(data) : `${label} is empty for project "${project}".`;
    return boxText([data]);
  }
  if (name === 'scratchpad_clear') {
    const count = await scratchpadClear(sub.id, project, context);
    return `Cleared ${count} entries from ${label} (project: ${project}).`;
  }
  throw new Error(`Unknown data box tool: ${name}`);
}
