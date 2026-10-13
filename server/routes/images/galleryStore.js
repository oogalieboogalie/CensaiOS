import fs from 'fs';
import path from 'path';

const STATE_DIR = path.resolve(process.cwd(), '.homebase-state');
const GALLERY_FILE = process.env.IMAGE_GALLERY_FILE || path.join(STATE_DIR, 'image-gallery.json');
let mutationQueue = Promise.resolve();

export async function listGalleryImages({ workspaceId }) {
  const scope = requiredText(workspaceId, 'workspaceId');
  return (await readGallery()).filter(image => image.workspaceId === scope);
}

export async function saveGalleryImage(item, { workspaceId, userId }) {
  const scopedItem = {
    ...item,
    workspaceId: requiredText(workspaceId, 'workspaceId'),
    createdByUserId: requiredText(userId, 'userId'),
  };
  return mutateGallery(images => [
    scopedItem,
    ...images.filter(image => image.id !== scopedItem.id),
  ], scopedItem);
}

export async function deleteGalleryImage(id, { workspaceId }) {
  const imageId = requiredText(id, 'imageId');
  const scope = requiredText(workspaceId, 'workspaceId');
  return mutateGallery(images => images.filter(
    image => image.id !== imageId || image.workspaceId !== scope
  ), images => images.some(image => image.id === imageId && image.workspaceId === scope));
}

function mutateGallery(update, result) {
  const operation = mutationQueue.then(async () => {
    const images = await readGallery();
    const next = update(images);
    await writeGallery(next);
    return typeof result === 'function' ? result(images) : result;
  });
  mutationQueue = operation.catch(() => {});
  return operation;
}

function requiredText(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${field} is required`);
  return text;
}

async function readGallery() {
  try {
    const raw = await fs.promises.readFile(GALLERY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeGallery(items) {
  await fs.promises.mkdir(path.dirname(GALLERY_FILE), { recursive: true });
  const tmpPath = `${GALLERY_FILE}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(items, null, 2), 'utf8');
  await fs.promises.rename(tmpPath, GALLERY_FILE);
}
