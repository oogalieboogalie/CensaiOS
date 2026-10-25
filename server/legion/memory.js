// Legion: long-term memory, from the self-educate diagram ("Search Long
// term Memory" and "Store any major/important info to memory"). One small
// JSON file per person, next to their runs, shared by every Legion they run.
import fs from 'node:fs/promises';
import path from 'node:path';
import { readJson } from './workspace.js';

export const MEMORY_FILE = 'memory.json';
const MAX_NOTES = 300;
const NOTE_CHARS = 400;

const words = (text) => new Set(String(text || '').toLowerCase().match(/[a-z0-9]{4,}/g) || []);

/** The notes that share the most words with the query, best first. */
export function searchNotes(notes, query, limit = 4) {
  const want = words(query);
  if (!want.size) return [];
  return notes
    .map((note) => ({ note, score: [...words(note.text)].filter((w) => want.has(w)).length }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || String(b.note.at).localeCompare(String(a.note.at)))
    .slice(0, limit)
    .map((hit) => hit.note);
}

/**
 * The person's memory: search(query) and store([{ text, from, job }]),
 * which resolves to the texts that were new.
 * Writes go one at a time, because jobs run side by side.
 */
export function openMemory(userDir) {
  const file = path.join(userDir, MEMORY_FILE);
  let writing = Promise.resolve();
  const load = async () => {
    const saved = await readJson(file);
    if (Array.isArray(saved?.notes)) return saved.notes;
    // A file that is there but unreadable is never overwritten with less.
    const there = await fs.stat(file).then(() => true, () => false);
    if (there) throw new Error('The Legion memory file could not be read.');
    return [];
  };
  const save = async (notes) => {
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ notes }, null, 2), 'utf8');
    await fs.rename(tmp, file);
  };
  return {
    search: async (query, limit) => searchNotes(await load().catch(() => []), query, limit),
    store: (items, goal = '') => {
      const fresh = items
        .map((item) => ({ ...item, text: String(item?.text || '').trim().slice(0, NOTE_CHARS) }))
        .filter((item) => item.text);
      if (!fresh.length) return Promise.resolve([]);
      const done = writing.then(async () => {
        const notes = await load();
        const added = [];
        const known = new Set(notes.map((n) => n.text.toLowerCase()));
        for (const item of fresh) {
          if (known.has(item.text.toLowerCase())) continue;
          known.add(item.text.toLowerCase());
          added.push(item.text);
          notes.push({ at: new Date().toISOString(), text: item.text, from: item.from || '', job: item.job || '', goal: String(goal).slice(0, 200) });
        }
        if (added.length) await save(notes.slice(-MAX_NOTES));
        return added;
      }).catch(() => []);
      writing = done;
      return done;
    },
  };
}

/** A memory that lives only as long as the run (tests, and no state folder). */
export function memoryInMemory(notes = []) {
  return {
    notes,
    search: async (query, limit) => searchNotes(notes, query, limit),
    store: async (items) => {
      const added = [];
      for (const item of items) {
        if (!item?.text || notes.some((n) => n.text === item.text)) continue;
        notes.push({ at: new Date().toISOString(), ...item });
        added.push(item.text);
      }
      return added;
    },
  };
}
