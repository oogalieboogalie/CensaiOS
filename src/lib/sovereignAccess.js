export function shouldShowSovereignAccessGate(session, unlocked = false) {
  return Boolean(session?.requiresUserApiKey) && !unlocked;
}
