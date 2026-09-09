import { listLeads, saveLead, setLeadStatus } from '../../salesLeads/store.js';

function leadLine(lead) {
  const who = [lead.name, lead.team ? `(${lead.team})` : null].filter(Boolean).join(' ');
  const where = [lead.brokerage, lead.city].filter(Boolean).join(' · ');
  const contact = [lead.phone, lead.email].filter(Boolean).join(' / ') || 'no contact yet';
  const socials = [lead.facebook && 'fb', lead.instagram && 'ig', lead.linkedin && 'li'].filter(Boolean).join(',');
  return `${who}${where ? ` — ${where}` : ''} [score ${(Number(lead.icp_score) || 0).toFixed(2)}] <${lead.id}> :: ${contact}${socials ? ` [${socials}]` : ''}`;
}

export async function handleResearchTool(agentId, name, args, context = {}) {
  switch (name) {
    case 'lead_save': {
      const result = await saveLead(args, {
        workspaceId: context.workspaceId,
        userId: context.userId,
      });
      return result.deduped
        ? `Lead already in store — updated signals/score (id ${result.id}).`
        : `Lead saved (id ${result.id}).`;
    }
    case 'lead_list': {
      const leads = await listLeads({
        workspaceId: context.workspaceId,
        userId: context.userId,
        status: args.status,
        minScore: args.min_score,
        limit: args.limit,
      });
      if (leads.length === 0) return 'No leads in the store yet.';
      return leads.map(leadLine).join('\n');
    }
    case 'lead_status': {
      const ok = await setLeadStatus(args.lead_id, args.status, {
        workspaceId: context.workspaceId,
        userId: context.userId,
      });
      return ok ? `Lead ${args.lead_id} → ${args.status}.` : `Lead ${args.lead_id} not found in this workspace.`;
    }
    default:
      throw new Error(`Unknown research tool: ${name}`);
  }
}
