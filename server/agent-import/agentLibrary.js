// Agent library import: turns the owner's old agent spreadsheets (CSV
// exports with an Agent column and a prompt column) into helpers on the
// core agents' teams. Pure: no database, no files. The CLI in
// scripts/import-agent-library.mjs reads the files and writes the rows.
//
// Rules, in order:
//   - names are trimmed (also non-breaking spaces), a name typed twice in a
//     row is collapsed, an unclosed "(" is closed
//   - a row needs a real prompt: at least 200 characters that talk to the
//     agent ("You are ..."); one-line notes and empty cells are skipped
//   - prompts are kept as written; only line endings and the blank lines
//     around the text are tidied
//   - the same prompt twice is kept once; the same name with a different
//     prompt gets " (v2)", " (v3)" ...
//   - extra files only add agents whose prompt is not already in the main one

export const LIBRARY_SOURCE = 'agent-library-2025';
export const MIN_PROMPT_CHARS = 200;

export function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function cellsByHeader(rows) {
  const headers = (rows[0] || []).map(h => String(h).trim().toLowerCase());
  return rows.slice(1).map((cells, index) => {
    const out = { row: index + 2 };
    headers.forEach((h, i) => { out[h] = cells[i] ?? ''; });
    return out;
  });
}

export function cleanName(raw) {
  let name = String(raw || '').replace(/[\u00a0\s]+/g, ' ').trim();
  // "The Financial ControllerThe Financial Controller" -> one copy.
  const half = name.length / 2;
  if (Number.isInteger(half) && half > 3 && name.slice(0, half) === name.slice(half)) name = name.slice(0, half).trim();
  const open = (name.match(/\(/g) || []).length;
  const close = (name.match(/\)/g) || []).length;
  if (open > close) name += ')'.repeat(open - close);
  return name;
}

export function cleanPrompt(raw) {
  return String(raw || '').replace(/\r\n?/g, '\n').replace(/^(?:[ \t\u00a0]*\n)+/, '').replace(/\s+$/, '');
}

export function isRealPrompt(prompt) {
  const text = String(prompt || '').trim();
  if (text.length < MIN_PROMPT_CHARS) return false;
  return /\byou are\b/i.test(text.slice(0, 800));
}

function oneLine(value, max) {
  const text = String(value || '').replace(/[\u00a0\s]+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '));
  return (stop > max * 0.5 ? cut.slice(0, stop) : cut.replace(/\s+\S*$/, '')).replace(/[.,;:\s]+$/, '') + '…';
}

function stripLabel(value, label) {
  return String(value || '').replace(new RegExp(`^\\s*${label}:\\s*`, 'i'), '').replace(/[\u00a0\s]+/g, ' ').trim();
}

function promptKey(prompt) {
  return String(prompt || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Rows of the main sheet (Agent, Target Tool, Use Case, Technique, Prompt). */
export function readMainSheet(text, file = 'main.csv') {
  return cellsByHeader(parseCsv(text)).map(r => ({
    file,
    row: r.row,
    rawName: r.agent,
    prompt: r.prompt,
    useCase: r['use case'] || '',
    targetTool: stripLabel(r['target tool'], 'target tool'),
    technique: stripLabel(r.technique, 'technique'),
  }));
}

/** Rows of a two-column sheet (Agent, Prompt). */
export function readPromptSheet(text, file = 'prompts.csv') {
  return cellsByHeader(parseCsv(text)).map(r => ({ file, row: r.row, rawName: r.agent, prompt: r.prompt, useCase: '', targetTool: '', technique: '' }));
}

/**
 * A blueprint sheet keeps one line of a prompt per row: a named row starts an
 * agent, the unnamed rows under it carry on its text (blank rows are blank
 * lines). `column` is the header holding the text.
 */
export function readBlueprintSheet(text, file = 'blueprints.csv', column = 'prompt_points') {
  const rows = cellsByHeader(parseCsv(text));
  const out = [];
  let current = null;
  for (const r of rows) {
    const name = String(r.agent || '').trim();
    if (name) {
      current = { file, row: r.row, rawName: r.agent, lines: [r[column] || ''], useCase: String(r.purpose || '').trim(), targetTool: '', technique: '' };
      out.push(current);
    } else if (current) {
      current.lines.push(r[column] || '');
    }
  }
  return out.map(({ lines, ...entry }) => ({ ...entry, prompt: lines.join('\n') }));
}

/**
 * Build the import plan.
 * @param {{main: object[], extras?: object[][], renames?: object, roles?: object, placement?: object, defaultParent?: string}} input
 * @returns {{agents: object[], skipped: {file:string,row:number,name:string,why:string}[]}}
 */
export function buildLibraryPlan({ main = [], extras = [], renames = {}, roles = {}, placement = {}, defaultParent = 'censai' } = {}) {
  const agents = [];
  const skipped = [];
  const seenPrompts = new Map();
  const nameCount = new Map();

  const consider = (entry, { fromExtra }) => {
    const cleaned = cleanName(entry.rawName);
    const name = renames[cleaned] || cleaned;
    const prompt = cleanPrompt(entry.prompt);
    const where = { file: entry.file, row: entry.row, name: name || '(blank)' };
    if (!name && !prompt.trim()) return; // blank spreadsheet row
    if (!name) { skipped.push({ ...where, why: 'no name' }); return; }
    if (!isRealPrompt(prompt)) {
      skipped.push({ ...where, why: prompt.trim() ? `no real prompt, only a note ("${oneLine(prompt, 60)}")` : 'no prompt' });
      return;
    }
    const key = promptKey(prompt);
    const twin = seenPrompts.get(key);
    if (twin) {
      const why = fromExtra && !twin.fromExtra ? `already in the main file as "${twin.name}"` : `same prompt as "${twin.name}"`;
      skipped.push({ ...where, why });
      return;
    }
    const count = (nameCount.get(name.toLowerCase()) || 0) + 1;
    nameCount.set(name.toLowerCase(), count);
    const finalName = count > 1 ? `${name} (v${count})` : name;
    seenPrompts.set(key, { name: finalName, fromExtra });
    const roleText = roles[finalName] || roles[name] || oneLine(entry.useCase, 110) || 'Imported agent';
    const specialtyBits = [
      entry.useCase && oneLine(entry.useCase, 300) !== roleText ? oneLine(entry.useCase, 300) : '',
      entry.targetTool ? `Made for: ${oneLine(entry.targetTool, 60)}` : '',
      entry.technique ? `Technique: ${oneLine(entry.technique, 80)}` : '',
    ].filter(Boolean);
    agents.push({
      name: finalName,
      role: roleText,
      specialty: specialtyBits.join(' · ') || null,
      systemPrompt: prompt,
      parentId: placement[finalName] || placement[name] || defaultParent,
      assigned: Boolean(placement[finalName] || placement[name]),
      source: { file: entry.file, row: entry.row },
    });
  };

  main.forEach(entry => consider(entry, { fromExtra: false }));
  extras.flat().forEach(entry => consider(entry, { fromExtra: true }));
  return { agents, skipped };
}

/**
 * Settle names against what is already on the board. A name used by a core
 * agent or by a helper this import did not make gets " (imported)".
 * @param {object[]} agents  plan agents
 * @param {string[]} takenNames  names not made by this import
 */
export function avoidNameClashes(agents, takenNames) {
  const taken = new Set(takenNames.map(n => String(n).trim().toLowerCase()));
  return agents.map(agent => {
    let name = agent.name;
    if (taken.has(name.toLowerCase())) name = `${agent.name} (imported)`;
    let n = 2;
    while (taken.has(name.toLowerCase())) name = `${agent.name} (imported ${n++})`;
    taken.add(name.toLowerCase());
    return name === agent.name ? agent : { ...agent, name, renamedFrom: agent.name };
  });
}
