// How bash reads a command into words, for judging the files a coding
// agent's command names (./ownerOnlySteps.js). Quotes and a backslash keep
// spaces and brackets inside one word and are then taken off, so `cat
// "server (1).pem"`, `cat 'secrets copy.json'` and `cat server\ \(1\).pem`
// each hand cat one file. Nothing is run or spelled out: $names, wildcards
// and brace lists stay as they are written.

// What ends a word outside quotes: a space or a new line, and the signs that join or redirect commands.
const ENDS_WORD = /[\s;|&<>()`]/;
// Inside double quotes a backslash takes these as they are; before anything else it stays.
const KEPT_IN_DOUBLE = '"\\$`\n';

/**
 * The words bash would hand on from `command`, quotes and backslashes taken
 * off (`words`), and on their own the words inside each pair of quotes
 * (`quoted`), as a tool's input in JSON names a file: {"file":"server (1).pem"}.
 * A quote left open runs to the end. Time grows only with the command's length.
 */
export function shellWords(command) {
  const text = String(command || '');
  const words = [];
  const quoted = [];
  let word = null; // null between words; '' for a word begun with nothing in it yet, as "" is
  let quote = ''; // ', " or $' (where a backslash keeps the next sign) while inside quotes
  let inQuotes = '';
  const add = (sign) => {
    word = (word ?? '') + sign;
    if (quote) inQuotes += sign;
  };
  const open = (kind) => {
    quote = kind;
    inQuotes = '';
    word = word ?? '';
  };
  const close = () => {
    quoted.push(inQuotes);
    quote = '';
  };
  for (let at = 0; at < text.length; at += 1) {
    const sign = text[at];
    const next = text[at + 1];
    if (quote === "'" || quote === "$'") {
      if (sign === "'") close();
      else if (quote === "$'" && sign === '\\' && next !== undefined) {
        add(next);
        at += 1;
      } else add(sign);
    } else if (quote === '"') {
      if (sign === '"') close();
      else if (sign === '\\' && next !== undefined && KEPT_IN_DOUBLE.includes(next)) {
        if (next !== '\n') add(next);
        at += 1;
      } else add(sign);
    } else if (sign === "'" || sign === '"') {
      open(sign);
    } else if (sign === '$' && (next === "'" || next === '"')) {
      open(next === "'" ? "$'" : '"');
      at += 1;
    } else if (sign === '\\' && next !== undefined) {
      // A backslash before a new line joins two lines; before anything else it keeps that sign in the word.
      if (next !== '\n') add(next);
      at += 1;
    } else if (ENDS_WORD.test(sign)) {
      if (word !== null) words.push(word);
      word = null;
    } else {
      add(sign);
    }
  }
  if (quote) quoted.push(inQuotes);
  if (word !== null) words.push(word);
  return { words, quoted };
}
