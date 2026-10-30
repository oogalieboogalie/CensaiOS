// What the Files window's version bar and Send to GitHub say about the files
// saved versions leave out (server/projectGit/keptOut.js), in one place for
// the server and the screen.

/** A few of `names` in plain words: ".env", ".env and a.key", ".env, a.key, b.pem and 2 more". */
export function someNames(names) {
  const shown = names.slice(0, 3);
  if (names.length > shown.length) return `${shown.join(', ')} and ${names.length - shown.length} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown.join('');
}

/** The version bar's line about the files saved versions leave out. */
export const keptOutLine = (names) => `Left out of saved versions: ${someNames(names)}. Files like these can hold keys or passwords, so what they hold now stays on this computer and is never sent to GitHub.`;

/**
 * The version bar's line about such files the versions GitHub has hold,
 * which GitHub keeps: a key in one keeps working until it is replaced where
 * it was made, so editing the file is not enough.
 */
export const githubKeepsLine = (names) => (names.length === 1
  ? `GitHub already has an earlier copy of ${names[0]}, and keeps it. If it held keys or passwords, make new ones where you got them and turn the old ones off, then put the new ones in ${names[0]}: censaiOS cannot take GitHub's copy back.`
  : `GitHub already has earlier copies of ${someNames(names)}, and keeps them. If they held keys or passwords, make new ones where you got them and turn the old ones off, then put the new ones in those files: censaiOS cannot take GitHub's copies back.`);

/** What Send to GitHub says when versions it would send hold such a file. */
export const sendRefusal = (names) => `Nothing was sent to GitHub: earlier saved versions of this project hold ${someNames(names)}, ${names.length === 1 ? 'a file' : 'files'} that can hold keys or passwords, and GitHub would keep a copy. Saving a version never takes in such files or changes to them.`;

/** The button a send refused for such files offers. */
export const MAKE_AGAIN = 'Make those versions again without them';

const versionsWord = (count, one, many) => (count === 1 ? one : many);
const filesWord = (names, one, many) => (names.length === 1 ? one : many);

/**
 * What that button asks first, since it makes those versions again: `names`
 * are the files they added or changed, `githubHas` the ones the versions
 * GitHub has hold, which the versions made again do not hold either, and
 * `onMain` those of them GitHub's main branch holds.
 */
export function makeAgainQuestion(names, count, githubHas = [], onMain = []) {
  const all = [...new Set([...names, ...githubHas])];
  const asked = `Make again ${versionsWord(count, 'the version', count > 1 ? `the ${count} versions` : 'the versions')} GitHub doesn't have yet, without ${someNames(all)}? Every other change in ${versionsWord(count, 'it', 'them')} stays, and ${filesWord(all, 'the file stays', 'the files stay')} on this computer as ${filesWord(all, 'it is', 'they are')}.`;
  if (!githubHas.length) return asked;
  const kept = `${asked} GitHub keeps the ${filesWord(githubHas, 'copy', 'copies')} its own versions already hold`;
  return onMain.length ? `${kept}, and merging the next pull request takes ${someNames(onMain)} out of its main branch.` : `${kept}.`;
}

/** What the bar says once they are made again. */
export const madeAgainLine = (names, count) => `Made ${versionsWord(count, '1 version', `${count} versions`)} again without ${someNames(names)}. Send to GitHub can send ${versionsWord(count, 'it', 'them')} now.`;
