import { mayUseServerKeys } from '../security/serverKeys.js';

/**
 * The provider keys in this computer's .env file (and the Toolchains box)
 * are the owner's. A coding CLI started for someone gets them only when
 * mayUseServerKeys allows that person: the owner, an operator, or an account
 * the owner shares keys with (Settings, AI keys, "Share my AI keys with").
 * Everyone else runs on their own vault key or the CLI's own sign-in.
 * A lookup failure never opens the owner's keys to anyone.
 */
export async function cliMayUseServerKeys(userId, { mayUse = mayUseServerKeys } = {}) {
  try {
    return Boolean(await mayUse({ userId: userId ?? null }));
  } catch {
    return false;
  }
}
