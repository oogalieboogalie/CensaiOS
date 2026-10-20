// Ported from Open Books (MIT, an open-source bookkeeping tool) into YorWare Books.
/**
 * Import bank and credit card CSV exports. Column layouts differ by bank, so
 * the importer looks at the header row and works out which columns hold the
 * date, description, and amount (either one signed column, or separate debit
 * and credit columns).
 */

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function findColumn(headers, patterns, exclude = []) {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h, i) => !exclude.includes(i) && pattern.test(h));
    if (idx !== -1) return idx;
  }
  return undefined;
}

export function detectColumns(header) {
  const h = header.map((x) => x.trim().toLowerCase());
  const date = findColumn(h, [/^(transaction|trans\.?) date$/, /^date$/, /^posted date$/, /^post(ing)? date$/, /date/]);
  const description = findColumn(h, [/^description$/, /^payee$/, /^merchant$/, /^name$/, /description/, /payee|merchant/, /^memo$/, /details|narrative/]);
  const type = findColumn(h, [/^type$/, /^transaction type$/, /dr\/cr|credit debit indicator/]);
  const taken = [date ?? -1, type ?? -1];
  const debit = findColumn(h, [/^debit$/, /debit|withdrawal|money out|paid out/], taken);
  const credit = findColumn(h, [/^credit$/, /credit|deposit|money in|paid in/], [...taken, debit ?? -1]);
  // "Debit Amount" and "Credit Amount" are the split columns, not one signed amount.
  const amount = findColumn(h, [/^amount$/, /^transaction amount$/, /amount/], [...taken, debit ?? -1, credit ?? -1]);

  if (date === undefined || description === undefined) return null;
  if (amount !== undefined) return { date, description, amount, type };
  if (debit !== undefined || credit !== undefined) return { date, description, debit, credit };
  return null;
}

/** "12,50" and "1.234,56" are European decimals; "1,234" and "1,234.56" are US thousands. */
function plainNumber(s) {
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s)) return s.replace(/\./g, "").replace(",", ".");
  return s.replace(/,/g, "");
}

/** Parses "$1,234.56", "-12.00", "(12.00)", "(-12.00)", "12.00 CR", "12,50" into integer cents. */
export function parseAmountCents(raw) {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (/\bDR$/i.test(s)) {
    negative = true;
    s = s.replace(/\s*DR$/i, "");
  }
  s = s.replace(/\s*CR$/i, "");
  s = s.replace(/[$\s]/g, "");
  // Every way of writing "minus" means money out; they never cancel out.
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  s = plainNumber(s);
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return negative ? -cents : cents;
}

/** Parses common US date formats into YYYY-MM-DD. */
export function parseDate(raw) {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) {
    let year = +m[3];
    // Two-digit years: 00-50 are this century, 51-99 the last ("12/31/69" is 1969).
    if (year < 100) year += year <= 50 ? 2000 : 1900;
    return ymd(year, +m[1], +m[2]);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    // A date with its own time zone ("... 00:00:00 GMT") is read in that zone, not the computer's.
    if (/(GMT|UTC|Z|[+-]\d{2}:?\d{2})$/i.test(s)) return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

function ymd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function rowsFromCsv(text, options = {}) {
  return rowsFromTable(parseCsv(text), options);
}

/** Same as rowsFromCsv, for rows that are already split into cells (such as a Google Sheet). */
export function rowsFromTable(input, options = {}) {
  const table = input.map((r) => r.map((c) => String(c ?? ""))).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (table.length === 0) return { rows: [], errors: ["The file is empty."], mapping: null };

  // Some banks put a few lines of account info above the header.
  let headerIdx = -1;
  let mapping = null;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    mapping = detectColumns(table[i]);
    if (mapping) {
      headerIdx = i;
      break;
    }
  }
  if (!mapping) {
    return {
      rows: [],
      errors: ["Could not find date, description, and amount columns. The first row should be a header such as: Date, Description, Amount."],
      mapping: null,
    };
  }

  const rows = [];
  const errors = [];
  for (let i = headerIdx + 1; i < table.length; i++) {
    const r = table[i];
    const lineNo = i + 1;
    const date = parseDate(r[mapping.date] ?? "");
    const description = (r[mapping.description] ?? "").trim();
    let amount = null;
    let signKnown = false;

    if (mapping.amount !== undefined) {
      amount = parseAmountCents(r[mapping.amount] ?? "");
      if (amount !== null && mapping.type !== undefined) {
        const type = (r[mapping.type] ?? "").trim().toLowerCase();
        if (/^(debit|dr|withdrawal|sale|purchase)$/.test(type)) { amount = -Math.abs(amount); signKnown = true; }
        else if (/^(credit|cr|deposit)$/.test(type)) { amount = Math.abs(amount); signKnown = true; }
      }
    } else {
      const debit = mapping.debit !== undefined ? parseAmountCents(r[mapping.debit] ?? "") : null;
      const credit = mapping.credit !== undefined ? parseAmountCents(r[mapping.credit] ?? "") : null;
      if (debit !== null && debit !== 0) amount = -Math.abs(debit);
      else if (credit !== null) amount = Math.abs(credit);
      else if (debit === 0) amount = 0;
      signKnown = true;
    }

    if (!date || !description || amount === null) {
      errors.push(`Row ${lineNo}: skipped (could not read ${!date ? "date" : !description ? "description" : "amount"}).`);
      continue;
    }
    rows.push({ date, description, amountCents: options.flipSigns && !signKnown ? -amount : amount });
  }
  return { rows, errors, mapping };
}
