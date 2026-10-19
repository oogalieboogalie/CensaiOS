import fs from 'fs';
import path from 'path';

// Files search and backlinks. Both used to walk the whole folder tree even
// after they had their 100 results, so a very big folder could hang. This
// walk stops as soon as it has `limit` matches and says so (`capped`).
// Hidden folders and node_modules are skipped; a folder that can't be read
// below the root is skipped instead of failing the whole search.
export const RESULT_LIMIT = 100;

export async function walkFiles(root, match, { limit = RESULT_LIMIT } = {}) {
  const results = [];
  const queue = [root];
  while (queue.length) {
    const dir = queue.shift();
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (dir === root) throw err;
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (await match(entry, fullPath)) {
        // isDir: false so the Files tree opens a hit as a file, not as a folder.
        results.push({ name: entry.name, path: fullPath, relativePath: path.relative(root, fullPath), isDir: false });
        if (results.length >= limit) return { results, capped: true };
      }
    }
  }
  return { results, capped: false };
}
