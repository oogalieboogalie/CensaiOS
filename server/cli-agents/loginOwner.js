import fs from 'fs';
import path from 'path';

/**
 * A coding CLI's own sign-in (claude login, codex login…) is one person's
 * personal account. Anthropic, OpenAI and Google all forbid sharing it, and
 * Anthropic forbids routing other people's requests through a Claude Pro or
 * Max plan. So on a shared board the first person who runs a CLI on its own
 * sign-in owns that sign-in; anyone else must bring their own API key.
 *
 * Claims live in a small JSON file ({ "<cli id>": <user id> }). When the CLI
 * is signed out (no login file) the claim is dropped, so whoever signs in
 * next owns it.
 */

function readClaims(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeClaims(file, claims) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(claims, null, 2));
}

/** Returns null when this user may use the CLI's own sign-in, else a plain-words reason. */
export function claimCliLogin({ file, adapter, userId, signedIn }) {
  const claims = readClaims(file);
  if (!signedIn) {
    if (adapter.id in claims) {
      delete claims[adapter.id];
      writeClaims(file, claims);
    }
    return null;
  }
  if (userId == null) return null;
  const owner = claims[adapter.id];
  if (owner == null) {
    claims[adapter.id] = userId;
    writeClaims(file, claims);
    return null;
  }
  if (String(owner) === String(userId)) return null;
  return `${adapter.label} on this computer is signed in with another person's ${adapter.vendor} account, `
    + `and ${adapter.vendor} does not allow sharing a sign-in. Add your own ${adapter.vendor} API key in Settings, `
    + 'under Bring Your Own Key, then try again.';
}
