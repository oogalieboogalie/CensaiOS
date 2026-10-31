import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// A Save writes a whole new copy next to the file and swaps it in only once
// the copy is whole and on the disk, so a disk that fills up partway (or a
// server stopped mid-write) leaves the file as it was. Before the swap the
// copy takes the file's owner and permissions, and it replaces the file a
// link leads to, so the link keeps leading there. Where a copy cannot stand
// in for the file (another name shares it, its owner cannot be given to the
// copy, the folder takes no new files, the swap is refused), the Save writes
// in place as it always did, and a full disk met there marks the error
// `cutShort` so the window says the file may be cut short.

// The folder takes no new files, though the file itself may take new words.
const FOLDER_REFUSES_COPY = new Set(['EACCES', 'EPERM', 'ENAMETOOLONG']);
// A full disk is never answered by writing in place, which could cut the file short.
const DISK_FULL = new Set(['ENOSPC', 'EDQUOT']);

const removeQuietly = (file) => fs.promises.unlink(file).catch(() => {});

/** Writes over the file itself, as a Save always did. */
async function writeInPlace(file, content) {
  try {
    await fs.promises.writeFile(file, content, { encoding: 'utf8', flag: 'w' });
  } catch (err) {
    if (DISK_FULL.has(err.code)) err.cutShort = true;
    throw err;
  }
}

/** Where `target` really leads, or null when nothing is there yet. */
async function realFile(target) {
  try {
    return await fs.promises.realpath(target);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Save `content` to `target`, a path already checked to be in a project open
 * on the board. `create`: a new file only, never over one already there; a
 * new file cut short is removed again.
 */
export async function saveWhole(target, content, { create = false } = {}) {
  if (create) return saveNew(target, content);
  const real = await realFile(target);
  // A link that leads nowhere yet: written through, as before.
  if (!real && (await fs.promises.lstat(target).catch(() => null))?.isSymbolicLink()) return writeInPlace(target, content);
  const file = real || target;
  const stats = real ? await fs.promises.stat(real) : null;
  if (stats?.isDirectory()) throw Object.assign(new Error('EISDIR: a folder, not a file'), { code: 'EISDIR' });
  // A file this server may not write stays refused, though its folder would take a copy.
  if (stats) await fs.promises.access(file, fs.constants.W_OK);
  // Another name for the same file (a hard link) would keep the old words.
  if (stats && (!stats.isFile() || stats.nlink > 1)) return writeInPlace(file, content);
  return swapInCopy(file, content, stats);
}

async function swapInCopy(file, content, stats) {
  const copy = path.join(path.dirname(file), `.${path.basename(file).slice(0, 80)}.saving-${crypto.randomBytes(4).toString('hex')}`);
  try {
    // Private until it takes the file's own permissions.
    await fs.promises.writeFile(copy, content, { encoding: 'utf8', flag: 'wx', ...(stats ? { mode: 0o600 } : {}) });
    await onDisk(copy);
  } catch (err) {
    await removeQuietly(copy);
    if (FOLDER_REFUSES_COPY.has(err.code)) return writeInPlace(file, content);
    throw err;
  }
  try {
    if (stats) await keepOwnerAndMode(copy, stats);
  } catch {
    await removeQuietly(copy);
    return writeInPlace(file, content);
  }
  try {
    await fs.promises.rename(copy, file);
  } catch (err) {
    await removeQuietly(copy);
    if (err.code === 'EISDIR' || DISK_FULL.has(err.code)) throw err;
    return writeInPlace(file, content);
  }
}

/** The copy's words written all the way to the disk, before it stands in for the file. */
async function onDisk(copy) {
  const handle = await fs.promises.open(copy, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function keepOwnerAndMode(copy, stats) {
  // Owner first: changing it clears the set-user and set-group bits the mode gives back.
  if (process.platform !== 'win32') await fs.promises.chown(copy, stats.uid, stats.gid);
  await fs.promises.chmod(copy, stats.mode & 0o7777);
}

async function saveNew(target, content) {
  try {
    await fs.promises.writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    // Made here and cut short: removed, so a failed Save leaves nothing behind.
    if (err.code !== 'EEXIST') await removeQuietly(target);
    throw err;
  }
}
