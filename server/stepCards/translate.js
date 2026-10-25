// Step cards: Censai turns a work-order card (goal, files, acceptance checks)
// into plain-words steps, each with one to four checks censaiOS can verify.
// The model writes the steps in the .todo format, and src/lib/stepCards/
// todoFile.js reads them back, so a check it cannot verify (a command that is
// not the project's own npm test or script, a path outside the project) is
// dropped and counted instead of trusted. A card already written as a .todo
// file skips the model.

import { TODO_FILE_HEADER, parseTodoFile } from '../../src/lib/stepCards/todoFile.js';

export const MAX_CARD_CHARS = 12_000;

const RULES = `You are Censai, the orchestrator in censaiOS. You turn a work-order card into small steps for someone who cannot read code.

Write ONLY a ${TODO_FILE_HEADER} in exactly this shape, nothing before or after it:

${TODO_FILE_HEADER}
== <the card's title in plain words>
Goal: <one plain sentence: what works when this is finished>

-- Step 1: <a short plain title, verb first>
<one or two plain sentences: what to do and where it shows in the app>
[ ] <a check>

Rules:
- 2 to 8 steps, in the order they must happen. Each step is one piece of work a helper can finish on its own.
- Each step has 1 to 4 checks, one per line, each starting with "[ ] " and one of:
  file <path inside the project>                  (that file must exist)
  file <path inside the project> says "<text>"    (that file must contain that exact text)
  run npm test -- <test file path>                (the project's own tests must pass)
  run npm run <script name>                       (one of the project's own npm scripts must pass, like npm run gate)
  page /<path> [says "<text>"]                    (the project's own app, running on this computer, must answer that page)
  ask <one plain sentence that must be true>      (Censai reads the helper's report against it)
- Use file and run checks whenever the card names files, tests or commands, and page checks when it names a page or address of the project's own app. Use ask only for what no file or command can show, like how a screen looks.
- Never invent a file path the card does not name or clearly imply. Never write any other command.
- Plain, friendly words. No jargon in titles or sentences.`;

export function translateMessages(cardText) {
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `The card:\n\n${String(cardText).slice(0, MAX_CARD_CHARS)}` },
  ];
}

/** Text the model sent, without a code fence around it. */
export function unfence(text) {
  const value = String(text || '').trim();
  const fence = /```[\w-]*\n([\s\S]*?)```/.exec(value);
  return fence ? fence[1] : value;
}

export function looksLikeTodoFile(text) {
  return /^\s*==\s*\S/m.test(String(text || '')) && /^\s*--\s*\S/m.test(String(text || ''));
}

/**
 * { cards, skipped, translated }. complete(messages) -> text is the person's own model
 * (their saved key). Throws a plain-words error when nothing usable came back.
 */
export async function translateCard(cardText, { complete }) {
  const text = String(cardText || '').trim();
  if (!text) throw Object.assign(new Error('Paste a card first.'), { statusCode: 400 });
  if (looksLikeTodoFile(text)) {
    const parsed = parseTodoFile(text);
    if (parsed.cards.length) return { cards: parsed.cards, skipped: parsed.skipped, translated: false };
  }
  const reply = await complete(translateMessages(text));
  const parsed = parseTodoFile(unfence(reply));
  if (!parsed.cards.length) {
    throw Object.assign(new Error('Censai could not turn that card into steps. Try again, or paste a shorter card.'), { statusCode: 422 });
  }
  return { cards: parsed.cards.slice(0, 1), skipped: parsed.skipped, translated: true };
}
