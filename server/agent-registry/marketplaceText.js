import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { upsertSystemAgentCard } from './factories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeHeader(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      row.push(value.replace(/\r/g, ''));
      value = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      row.push(value.replace(/\r/g, ''));
      if (row.some((cell) => cell.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      value = '';
      continue;
    }
    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r/g, ''));
    if (row.some((cell) => cell.trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

export function parseMarketplaceText(text) {
  const rows = parseCsvRows(String(text || ''));
  if (rows.length === 0) return [];

  const headers = rows[0].map(normalizeHeader);
  const parsedRows = [];

  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    if (cells.length === 0) continue;
    if (cells.every((cell) => cell.trim() === '')) continue;

    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    parsedRows.push(row);
  }

  return parsedRows;
}

export function buildSystemAgentCardFromRow(row, index = 0) {
  const name = String(row?.Agent || '').trim() || `Marketplace Agent ${index + 1}`;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `agent-${index + 1}`;
  const description = [
    String(row?.['Use Case'] || '').trim(),
    String(row?.Technique || '').trim(),
    String(row?.['Target Tool'] || '').trim(),
  ].filter(Boolean).join(' · ');

  return {
    id: `agent:${slug}`,
    name,
    description: description || 'Imported from marketplace text',
    version: '1.0.0',
    skills: [],
    visibility: 'public',
    owner_id: null,
    workspace_id: null,
    metadata: {
      source: 'marketplace_text',
      importedAt: new Date().toISOString(),
      raw: {
        useCase: row?.['Use Case'] || '',
        targetTool: row?.['Target Tool'] || '',
        technique: row?.Technique || '',
      },
      prompt: String(row?.Prompt || '').trim(),
    },
  };
}

export async function importMarketplaceTextFile(filePath, opts = {}) {
  const resolvedPath = path.resolve(filePath);
  const text = fs.readFileSync(resolvedPath, 'utf8');
  const rows = parseMarketplaceText(text);
  const results = [];

  for (let index = 0; index < rows.length; index += 1) {
    const card = buildSystemAgentCardFromRow(rows[index], index);
    const upserted = await upsertSystemAgentCard(card);
    results.push({ card: upserted, sourceRow: rows[index] });
  }

  return { results, importedCount: results.length };
}

export async function importMarketplaceTextFromWorkspace(filePath, opts = {}) {
  return importMarketplaceTextFile(filePath, opts);
}
