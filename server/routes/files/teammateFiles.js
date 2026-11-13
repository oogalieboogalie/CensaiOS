import { isComputerOwner } from '../../security/systemAdmin.js';
import { OWNER_ONLY_FILE } from '../../security/secretFiles.js';
import { ownerOnlyKind } from '../../security/ownerOnlyFiles.js';
import { APP_FOLDER_ONLY } from './pathUtils.js';

// What in a project only this computer's owner opens (a file that holds keys,
// a hidden folder, a link out of the project: server/security/ownerOnlyFiles.js)
// stays the owner's on the board. So does censaiOS's own folder, which Files
// falls back to while no project is open: a teammate's Files offers only the
// projects open on the board, as the folder picker does (./folders.js). A
// teammate gets a plain refusal, the same whether or not the file is there.

/**
 * Throws for a teammate when `place` (from projectPlace) is censaiOS's own
 * folder, open only while no project is. True for the owner there, else false.
 */
export async function refuseAppFolderToTeammate(req, place) {
  if (!place?.appFolder) return false;
  if (await isComputerOwner(req, `${req.method} ${req.baseUrl}${req.path}`)) return true;
  throw Object.assign(new Error("Access denied: censaiOS's own folder is not a project open on this board"), { code: APP_FOLDER_ONLY });
}

/**
 * Throws an "Access denied" error when a teammate asks for what only this
 * computer's owner opens in the project (`place`, from projectPlace); a link
 * out of the project is refused as outside it. For the owner, true when it is
 * such a file, or one in censaiOS's own folder (its words then stay on the
 * owner's own screen), else false.
 */
export async function refuseToTeammate(req, place, options) {
  if (await refuseAppFolderToTeammate(req, place)) return true;
  const kind = await ownerOnlyKind(place, options);
  if (!kind) return false;
  if (await isComputerOwner(req, `${req.method} ${req.baseUrl}${req.path}`)) return true;
  throw kind === 'outside'
    ? new Error('Access denied: Path is outside the current project root')
    : Object.assign(new Error("Access denied: only this computer's owner opens this"), { code: OWNER_ONLY_FILE });
}
