export function collaborationHumanActor(session = {}) {
  const id = String(session.userId || '').trim();
  const localEmail = String(session.userEmail || '').trim().split('@')[0];
  return Object.freeze({
    type: 'human',
    id,
    label: localEmail.slice(0, 64) || `Member ${id}`,
  });
}
