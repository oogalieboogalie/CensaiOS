// A link made from Invite with no account. It is look-only, lasts 7 days,
// and a second person cannot join. The guest who joined keeps a guest
// session, not a signed-in account. Only the token's hash is stored.

export const ONE_TIME_LOOK_LABEL = 'One-time look';
export const ONE_TIME_LOOK_HOURS = 7 * 24;

/** Force the safe shape. A caller who asked for edit still gets look-only. */
export function inviteLinkInput(input = {}) {
  if (input?.oneTime !== true) return input || {};
  return {
    role: 'view',
    scopeKind: 'board',
    scopeId: null,
    mode: 'link',
    stage: false,
    label: ONE_TIME_LOOK_LABEL,
    expiresInHours: ONE_TIME_LOOK_HOURS,
    agentBudgetTokens: 0,
    passcode: '',
  };
}

/** True when this one-time link already has a join. Other links are never blocked. */
export async function oneTimeLinkUsed(db, link) {
  if (!link || link.label !== ONE_TIME_LOOK_LABEL) return false;
  const { rows } = await db.query(
    'SELECT 1 FROM share_link_joins WHERE link_id = $1 LIMIT 1',
    [link.id],
  );
  return rows.length > 0;
}
