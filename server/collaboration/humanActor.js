export function collaborationHumanActor(session = {}) {
  const id = String(session.userId || '').trim();
  // Teammates see the name you signed in with; the email's local part is the fallback.
  const name = String(session.userName || '').trim();
  const localEmail = String(session.userEmail || '').trim().split('@')[0];
  return Object.freeze({
    type: 'human',
    id,
    label: (name || localEmail).slice(0, 64) || `Member ${id}`,
  });
}
