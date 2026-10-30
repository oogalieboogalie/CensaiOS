import { isComputerOwner } from '../../security/systemAdmin.js';
import { OWNER_ONLY_FILE } from '../../security/secretFiles.js';
import { ownerOnlyKind } from '../../security/ownerOnlyFiles.js';

// What in a project only this computer's owner opens (a file that holds keys,
// a hidden folder, a link out of the project: server/security/ownerOnlyFiles.js)
// stays the owner's on the board. A teammate gets a plain refusal, the same
// whether or not the file is there.

/**
 * Throws an "Access denied" error when a teammate asks for what only this
 * computer's owner opens in the project (`place`, from projectPlace); a link
 * out of the project is refused as outside it. For the owner, true when it is
 * such a file (its words then stay on the owner's own screen), else false.
 */
export async function refuseToTeammate(req, place, options) {
  const kind = await ownerOnlyKind(place, options);
  if (!kind) return false;
  if (await isComputerOwner(req, `${req.method} ${req.baseUrl}${req.path}`)) return true;
  throw kind === 'outside'
    ? new Error('Access denied: Path is outside the current project root')
    : Object.assign(new Error("Access denied: only this computer's owner opens this"), { code: OWNER_ONLY_FILE });
}
