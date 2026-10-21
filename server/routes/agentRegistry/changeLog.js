// One 'agent-registry' log line for every change to an agent card: publish,
// edit, delete, install on a board and remove from a board. Each line names
// the card id, what changed (field names only), the account id and whether it
// worked or why not. Never a card's instructions, keys, prompts or other text.

import { createLogger } from '../../logger.js';

const log = createLogger('agent-registry');
const SAFE_ID = /^[\w:.@-]{1,120}$/;
const SAFE_FIELD = /^[A-Za-z_][\w]{0,40}$/;
const clip = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function cardIdOf(req, body) {
  const id = req.params?.id || body?.id || body?.card?.id || body?.install?.cardId || '';
  return SAFE_ID.test(String(id)) ? String(id) : '(unnamed)';
}

function changedFields(req, action) {
  if (action !== 'edit') return '';
  const fields = Object.keys(req.body || {}).filter((key) => SAFE_FIELD.test(key)).slice(0, 12);
  return fields.length ? `changed ${fields.join(', ')}` : 'changed nothing';
}

/** Express middleware: logs the change once the response has gone out. */
export function logCardChange(action) {
  return (req, res, next) => {
    let body = null;
    const sendJson = res.json.bind(res);
    res.json = (payload) => {
      body = payload;
      return sendJson(payload);
    };
    res.on('finish', () => {
      const status = res.statusCode;
      const by = req.agentActor?.id != null ? `account ${clip(req.agentActor.id, 20)}` : 'a signed-out caller';
      const where = req.query?.workspaceId || req.body?.workspaceId;
      const board = (action === 'install' || action === 'remove') && SAFE_ID.test(String(where || '')) ? ` on board ${where}` : '';
      const label = `${action} card ${cardIdOf(req, body)}${board} by ${by}`;
      if (status < 400) {
        const extra = changedFields(req, action);
        log.info(`${label}: done${extra ? ` (${extra})` : ''}`);
      } else {
        const why = clip(body?.error, 120) || 'no reason given';
        log.warn(`${label}: ${status === 401 || status === 403 ? 'refused' : 'failed'} (${status}, ${why})`);
      }
    });
    next();
  };
}
