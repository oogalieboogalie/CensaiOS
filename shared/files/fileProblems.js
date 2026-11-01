// Why a file would not open, in plain words. The server answers a failed read
// with one of these reasons (server/routes/files/pathUtils.js); the Document
// and Code editor windows show the words for it, never the server's own text.

export const FILE_PROBLEMS = Object.freeze({
  missing: 'This file is not there any more. It may have been moved or deleted.',
  outside: "This file is not in a project open on this board. This computer's owner can open its folder in Files.",
  denied: 'You may not open this file: this computer does not let censaiOS read it.',
  secret: "This file is in censaiOS's own folder of keys and logins, so it does not open on the board.",
  folder: 'This is a folder, not a file.',
  filesOff: "This censaiOS does not open files from its computer's folders.",
  unreadable: 'This file could not be opened just now.',
});

/** The plain words for a reason the server sent, or '' for any other value. */
export function fileProblemWords(reason) {
  return typeof reason === 'string' && Object.hasOwn(FILE_PROBLEMS, reason) ? FILE_PROBLEMS[reason] : '';
}

/**
 * False where "Try again" can never help: a folder stays a folder, censaiOS's
 * own keys never open, and files stay off until censaiOS is set up again.
 */
export function tryingAgainHelps(reason) {
  return reason !== 'folder' && reason !== 'secret' && reason !== 'filesOff';
}
