// Why a file would not open, in plain words. The server answers a failed read
// with one of these reasons (server/routes/files/pathUtils.js); the Document
// and Code editor windows show the words for it, never the server's own text.

export const FILE_PROBLEMS = Object.freeze({
  missing: 'This file is not there any more. It may have been moved or deleted.',
  outside: "This file is not in a project open on this board. This computer's owner can open its folder in Files.",
  denied: 'You may not open this file: this computer does not let censaiOS read it.',
  secret: "This file is in censaiOS's own folder of keys and logins, so it does not open on the board.",
  ownerOnly: "Only this computer's owner can open this file, since files like this can hold keys and passwords.",
  folder: 'This is a folder, not a file.',
  filesOff: "This censaiOS does not open files from its computer's folders.",
  unreadable: 'This file could not be opened just now.',
});

/** What a coding agent's changes show in place of what changed in a file that holds keys or passwords. */
export const SECRET_CHANGES = "This file can hold keys or passwords, so what changed in it is not shown here. Only this computer's owner can open it.";

/** What a teammate watching a coding agent sees for a step on such a file (server/cli-agents/ownerOnlySteps.js). */
export const OWNER_ONLY_STEP = "This step is on a file that can hold keys or passwords, so what it read, wrote or printed shows only for this computer's owner.";

/** What a teammate sees in place of a part of a diff that does not say which file it is of (a diff's tail, a plain diff). */
export const UNKNOWN_DIFF = 'Part of this diff does not say which file it is from, so it is not shown here, since it could be from a file that holds keys or passwords.';

/** What a teammate sees in place of a word that repeats a key or password from such a file (server/cli-agents/hiddenWords.js). */
export const HIDDEN_MARK = '[hidden]';

/** Under a step, a message or a summary where that happened. */
export const HIDDEN_WORDS = `Words here that repeat a key or password from a file only this computer's owner opens show as ${HIDDEN_MARK}.`;

/** What a teammate sees in place of a coding agent's raw output. */
export const OWNER_ONLY_RAW = "The raw output can hold keys and passwords from the files the agent read, so it shows only for this computer's owner.";

/** Why Step cards do not open such a file, even for the owner: cards sit on the shared board. */
export const STEPS_OFF_BOARD = "Only this computer's owner can open this file, so its steps stay off the shared board and it does not open as Step cards.";

/** What an agent's live preview says for such a file: the preview sits on the shared board, whoever's agent asks. */
export const PREVIEW_OFF_BOARD = 'The live preview is on the shared board, so it does not show a file that can hold keys or passwords (a .env, a key file, anything in a hidden folder) or one a link leads to outside the project.';

/** What the owner's window says about a file only this computer's owner can open. */
export const OFF_BOARD_NOTE = "This stays on your screen: only this computer's owner can open this file, so its words are kept off the shared board.";

/** The plain words for a reason the server sent, or '' for any other value. */
export function fileProblemWords(reason) {
  return typeof reason === 'string' && Object.hasOwn(FILE_PROBLEMS, reason) ? FILE_PROBLEMS[reason] : '';
}

// Why a file was not saved, in plain words. The server answers a refused save
// with one of these reasons (server/routes/files/pathUtils.js, and 'owner-only'
// from the owner check); the Document and Code editor say the file was not
// saved with the words for it, never the server's own text.
export const SAVE_PROBLEMS = Object.freeze({
  gone: 'Its folder is not there. It may have been moved or deleted.',
  outside: 'It is not in a project open on this board.',
  denied: 'This computer does not let censaiOS write there.',
  busy: 'Another program on this computer is using it. Close it there, then save again.',
  secret: 'censaiOS does not write into its own folder of keys and logins.',
  ownerOnly: "Only this computer's owner can save files on this computer.",
  folder: 'It is a folder now, not a file.',
  // The whole new copy did not fit, so the file on disk is as it was
  // (server/routes/files/saveWhole.js).
  full: "This computer's disk is full. The file on disk is as it was, so free up some space and save again.",
  // Written in place, where a whole copy could not stand in for the file:
  // writing had begun, so the file may hold only part of what was there.
  fullCutShort: "This computer's disk is full. The file on disk may now be cut short, so free up some space and save again.",
  exists: 'There is already a file with that name there.',
  tooBig: 'It is too big to save from here.',
  filesOff: "This censaiOS does not save to its computer's folders.",
  unsaved: 'censaiOS could not write it just now.',
});

/** The plain words for why a save was refused, or '' for a reason the server did not send. */
export function saveProblemWords(reason) {
  const key = reason === 'owner-only' ? 'ownerOnly' : reason;
  return typeof key === 'string' && Object.hasOwn(SAVE_PROBLEMS, key) ? SAVE_PROBLEMS[key] : '';
}

/**
 * What a window says when Save did not save `name`: that, why, and that what
 * was typed is still there. `unsure`: censaiOS itself never answered, so the
 * save may have happened after all.
 */
export function notSavedWords(name, why, unsure = false) {
  return `${name} ${unsure ? 'may not have been saved' : 'was not saved'}. ${why} Your changes are still here.`;
}

/**
 * True when a window's words stay on each person's own screen, never on the
 * shared board: a file only this computer's owner opens (on the owner's
 * screen it reads 'ownerOnly' too), or one in censaiOS's own folder of keys.
 */
export function staysOffBoard(reason) {
  return reason === 'ownerOnly' || reason === 'secret';
}

/**
 * False where "Try again" can never help: a folder stays a folder, censaiOS's
 * own keys never open, a file only the owner opens stays theirs, and files
 * stay off until censaiOS is set up again.
 */
export function tryingAgainHelps(reason) {
  return !['folder', 'secret', 'ownerOnly', 'filesOff'].includes(reason);
}
