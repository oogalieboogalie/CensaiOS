// ─── Mailcow Tool Handler ─────────────────────────────────────────────────────
// Executes mailcow_* agent tool calls against the mailcow REST API.
// Returns formatted plain-text results so the model can reason about them.

import { mailcowGet, mailcowPost, mailcowConfigured } from '../../mailcow.js';

function notConfigured() {
  return 'Mailcow addon is not configured. Ask the user to set MAILCOW_URL and MAILCOW_API_KEY in the .env file, then restart the server.';
}

function formatBytes(mb) {
  if (!mb || mb === 0) return 'unlimited';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export async function handleMailcowTool(agentId, name, args) {
  if (!mailcowConfigured()) return notConfigured();

  switch (name) {
    // ── Read tools ──────────────────────────────────────────────────────────

    case 'mailcow_domains': {
      try {
        const domains = await mailcowGet('/get/domain/all');
        if (!Array.isArray(domains) || domains.length === 0) {
          return 'No domains found on the mailcow instance.';
        }
        const lines = domains.map(d => {
          const active = d.active === '1' || d.active === 1 ? '✓ active' : '✗ inactive';
          const mboxes = d.mboxes_in_domain ?? d.mbox_count ?? '?';
          const quota = d.max_quota_for_domain ? formatBytes(d.max_quota_for_domain) : 'unlimited';
          return `  ${d.domain}  [${active}]  mailboxes: ${mboxes}  quota: ${quota}`;
        });
        return `MAILCOW DOMAINS (${domains.length})\n${'─'.repeat(60)}\n${lines.join('\n')}`;
      } catch (err) {
        return `mailcow_domains error: ${err.message}`;
      }
    }

    case 'mailcow_mailboxes': {
      try {
        const all = await mailcowGet('/get/mailbox/all');
        if (!Array.isArray(all) || all.length === 0) {
          return 'No mailboxes found on the mailcow instance.';
        }
        const domain = args.domain?.toLowerCase();
        const filtered = domain ? all.filter(m => m.domain?.toLowerCase() === domain) : all;
        if (filtered.length === 0) {
          return `No mailboxes found for domain "${domain}".`;
        }
        const lines = filtered.map(m => {
          const active = m.active === '1' || m.active === 1 ? '✓' : '✗';
          const used = formatBytes(m.used_quota);
          const max = formatBytes(m.quota);
          return `  ${active} ${m.username.padEnd(36)} ${m.name || ''}  (${used} / ${max})`;
        });
        return `MAILCOW MAILBOXES (${filtered.length})\n${'─'.repeat(70)}\n${lines.join('\n')}`;
      } catch (err) {
        return `mailcow_mailboxes error: ${err.message}`;
      }
    }

    case 'mailcow_aliases': {
      try {
        const aliases = await mailcowGet('/get/alias/all');
        if (!Array.isArray(aliases) || aliases.length === 0) {
          return 'No aliases found on the mailcow instance.';
        }
        const lines = aliases.map(a => {
          const active = a.active === '1' || a.active === 1 ? '✓' : '✗';
          return `  ${active} id:${String(a.id).padEnd(6)} ${a.address.padEnd(36)} → ${a.goto}`;
        });
        return `MAILCOW ALIASES (${aliases.length})\n${'─'.repeat(70)}\n${lines.join('\n')}`;
      } catch (err) {
        return `mailcow_aliases error: ${err.message}`;
      }
    }

    case 'mailcow_queue': {
      try {
        const queue = await mailcowGet('/get/mailq/all');
        if (!queue || (Array.isArray(queue) && queue.length === 0)) {
          return 'Mail queue is empty. ✓';
        }
        const items = Array.isArray(queue) ? queue : [queue];
        const lines = items.map(m =>
          `  [${m.queue_id || m.id || '?'}] from:${m.sender || '?'} to:${m.recipients?.join(', ') || '?'} reason:${m.reason || '?'}`
        );
        return `MAIL QUEUE — ${items.length} item(s)\n${'─'.repeat(70)}\n${lines.join('\n')}\n\nUse mailcow_add_alias or check Brevo relay config if messages are stuck.`;
      } catch (err) {
        return `mailcow_queue error: ${err.message}`;
      }
    }

    // ── Write tools ─────────────────────────────────────────────────────────

    case 'mailcow_add_mailbox': {
      const { local_part, domain, name, password, quota = 2048, active = 1 } = args;
      if (!local_part || !domain || !name || !password) {
        return 'mailcow_add_mailbox requires: local_part, domain, name, password.';
      }
      try {
        const result = await mailcowPost('/add/mailbox', {
          local_part,
          domain,
          name,
          password,
          password2: password,
          quota: String(quota),
          active: String(active),
          force_pw_update: '0',
        });
        const ok = Array.isArray(result)
          ? result.every(r => r.type === 'success')
          : result?.type === 'success';
        const address = `${local_part}@${domain}`;
        if (ok) return `✓ Mailbox created: ${address} (quota: ${formatBytes(quota)})`;
        const msg = Array.isArray(result) ? result.map(r => r.msg).join('; ') : JSON.stringify(result);
        return `mailcow_add_mailbox — mailcow returned: ${msg}`;
      } catch (err) {
        return `mailcow_add_mailbox error: ${err.message}`;
      }
    }

    case 'mailcow_delete_mailbox': {
      const { address } = args;
      if (!address) return 'mailcow_delete_mailbox requires: address.';
      try {
        const result = await mailcowPost('/delete/mailbox', { items: [address] });
        const ok = Array.isArray(result)
          ? result.every(r => r.type === 'success')
          : result?.type === 'success';
        if (ok) return `✓ Mailbox deleted: ${address}`;
        const msg = Array.isArray(result) ? result.map(r => r.msg).join('; ') : JSON.stringify(result);
        return `mailcow_delete_mailbox — mailcow returned: ${msg}`;
      } catch (err) {
        return `mailcow_delete_mailbox error: ${err.message}`;
      }
    }

    case 'mailcow_add_alias': {
      const { address, goto, active = 1 } = args;
      if (!address || !goto) return 'mailcow_add_alias requires: address, goto.';
      try {
        const result = await mailcowPost('/add/alias', { address, goto, active: String(active) });
        const ok = Array.isArray(result)
          ? result.every(r => r.type === 'success')
          : result?.type === 'success';
        if (ok) return `✓ Alias created: ${address} → ${goto}`;
        const msg = Array.isArray(result) ? result.map(r => r.msg).join('; ') : JSON.stringify(result);
        return `mailcow_add_alias — mailcow returned: ${msg}`;
      } catch (err) {
        return `mailcow_add_alias error: ${err.message}`;
      }
    }

    case 'mailcow_delete_alias': {
      const { id } = args;
      if (id === undefined || id === null) return 'mailcow_delete_alias requires: id (integer).';
      try {
        const result = await mailcowPost('/delete/alias', { items: [String(id)] });
        const ok = Array.isArray(result)
          ? result.every(r => r.type === 'success')
          : result?.type === 'success';
        if (ok) return `✓ Alias id:${id} deleted.`;
        const msg = Array.isArray(result) ? result.map(r => r.msg).join('; ') : JSON.stringify(result);
        return `mailcow_delete_alias — mailcow returned: ${msg}`;
      } catch (err) {
        return `mailcow_delete_alias error: ${err.message}`;
      }
    }

    default:
      throw new Error(`Unknown mailcow tool: ${name}`);
  }
}
