// YorWare PDF agent tools (spec 13): read_pdf, fill_pdf_field and sign_here
// read a PDF window off the board and save only the fields they add.
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import * as PdfLib from 'pdf-lib';
import { __resetWorkspaceHubForTests } from '../server/collaboration/workspaceHub.js';
import { addFilePatch, readPdf } from '../src/lib/yorware/pdfModel.js';
import { readPageInfo } from '../src/lib/yorware/pdfExport.js';
import { bytesToBase64 } from '../src/lib/yorware/pdfBytes.js';
import { valueKey } from '../src/lib/yorware/pdfForm.js';

let canvasValue;
let canvasRevision;
async function runQuery(sql, params = []) {
  const statement = String(sql);
  if (statement.includes('SELECT value, revision')) return { rows: [{ value: canvasValue, revision: canvasRevision }] };
  if (statement.includes('UPDATE workspace_client_state')) {
    canvasValue = JSON.parse(params[2]);
    canvasRevision += 1;
    return { rows: [{ revision: canvasRevision, updated_at: new Date().toISOString() }] };
  }
  return { rows: [] };
}
const pool = {
  connect: jest.fn(async () => ({ release: jest.fn(), query: jest.fn(runQuery) })),
  query: jest.fn(runQuery),
};
const requireWorkspaceMember = jest.fn(async () => ({ id: 'workspace-a', role: 'member' }));
const getSubAgentById = jest.fn(async () => null);

jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/memory.js', () => ({ getSubAgentById, getAgent: jest.fn(async () => null) }));

const { handlePdfTool } = await import('../server/tools/handlers/pdf.js');
const { TOOL_DEFINITIONS } = await import('../server/tools/definitions.js');
const { listToolCatalog } = await import('../server/tools/catalog.js');
const { CAPABILITY_TO_TOOLS } = await import('../server/tools/rbac/capabilities.js');

const context = { workspaceId: 'workspace-a', userId: 7 };
let lease;

beforeAll(async () => {
  const pdf = await PdfLib.PDFDocument.create();
  const p1 = pdf.addPage([612, 792]);
  p1.drawText('Lease for 12 Elm Street', { x: 50, y: 740, size: 14 });
  p1.drawText('Tenant signature:', { x: 50, y: 120, size: 12 });
  const p2 = pdf.addPage([612, 792]);
  p2.drawText('House rules: no smoking', { x: 50, y: 740, size: 12 });
  const form = pdf.getForm();
  form.createTextField('tenant_name').addToPage(p1, { x: 50, y: 600, width: 220, height: 22 });
  form.createCheckBox('has_pets').addToPage(p1, { x: 50, y: 560, width: 14, height: 14 });
  const plan = form.createDropdown('plan');
  plan.addOptions(['Monthly', 'Yearly']);
  plan.addToPage(p2, { x: 50, y: 500, width: 150, height: 22 });
  const bytes = await pdf.save();
  let win = { id: 'pdf-1', kind: 'yorPdf', title: 'Lease', x: 0, y: 0, w: 1040, h: 720, pdfDoc: { order: [] } };
  win = { ...win, ...addFilePatch(readPdf(win), { name: 'lease.pdf', data: bytesToBase64(bytes), bytes: bytes.length, pages: await readPageInfo(bytes, PdfLib) }).patch };
  lease = win;
});

beforeEach(() => {
  __resetWorkspaceHubForTests();
  jest.clearAllMocks();
  canvasValue = { wins: [structuredClone(lease), { id: 'doc-1', kind: 'doc', title: 'Notes', text: 'hi', x: 0, y: 0, w: 10, h: 10 }] };
  canvasRevision = 3;
  getSubAgentById.mockResolvedValue(null);
});
afterEach(() => __resetWorkspaceHubForTests());

const pdfWin = () => canvasValue.wins[0];

test('read_pdf gives the words on each page, the form and its answers', async () => {
  const out = await handlePdfTool('atlas', 'read_pdf', { window_id: 'pdf-1' }, context);
  expect(out).toContain('PDF "Lease" — 2 pages (files: lease.pdf)');
  expect(out).toContain('--- Page 1 (lease.pdf page 1, 612×792 pt) ---');
  expect(out).toContain('Lease for 12 Elm Street');
  expect(out).toContain('House rules: no smoking');
  expect(out).toMatch(/"tenant_name" \(text\) on page 1 = ""/);
  expect(out).toMatch(/"has_pets" \(tick box\) on page 1 = not ticked/);
  expect(out).toMatch(/"plan" \(pick one\) on page 2 = "" options: Monthly \/ Yearly/);
  const page2 = await handlePdfTool('atlas', 'read_pdf', { window_id: 'pdf-1', from_page: 2 }, context);
  expect(page2).not.toContain('Elm Street');
});

test('fill_pdf_field saves just that answer, and read_pdf shows it', async () => {
  const before = Object.keys(pdfWin()).length;
  const out = await handlePdfTool('atlas', 'fill_pdf_field', { window_id: 'pdf-1', field: 'tenant_name', value: 'Sam Rivera' }, context);
  expect(out).toMatch(/Filled "tenant_name" with "Sam Rivera" on page 1 of "Lease"/);
  const fileId = Object.values(readPdf(pdfWin()).pages)[0].file;
  expect(pdfWin()[valueKey(fileId, 'tenant_name')]).toMatchObject({ file: fileId, name: 'tenant_name', value: 'Sam Rivera' });
  expect(Object.keys(pdfWin()).length).toBe(before + 2); // the answer and updatedAt
  expect(canvasRevision).toBe(4);
  await handlePdfTool('atlas', 'fill_pdf_field', { window_id: 'pdf-1', field: 'HAS_PETS', value: true }, context);
  await handlePdfTool('atlas', 'fill_pdf_field', { window_id: 'pdf-1', field: 'plan', value: 'yearly' }, context);
  const read = await handlePdfTool('atlas', 'read_pdf', { window_id: 'pdf-1' }, context);
  expect(read).toMatch(/"tenant_name" \(text\) on page 1 = "Sam Rivera"/);
  expect(read).toMatch(/"has_pets" \(tick box\) on page 1 = ticked/);
  expect(read).toMatch(/"plan" \(pick one\) on page 2 = "Yearly"/);
});

test('fill_pdf_field refuses unknown fields, bad options and other windows', async () => {
  await expect(handlePdfTool('atlas', 'fill_pdf_field', { window_id: 'pdf-1', field: 'nope', value: 'x' }, context))
    .resolves.toMatch(/^Error: There is no form field called "nope"/);
  await expect(handlePdfTool('atlas', 'fill_pdf_field', { window_id: 'pdf-1', field: 'plan', value: 'Weekly' }, context))
    .resolves.toMatch(/^Error: "Weekly" is not one of the options for "plan": Monthly \/ Yearly/);
  await expect(handlePdfTool('atlas', 'read_pdf', { window_id: 'doc-1' }, context))
    .resolves.toMatch(/^Error: That window is not a PDF/);
  expect(canvasRevision).toBe(3);
});

test('sign_here puts a flag next to printed words and never signs', async () => {
  const out = await handlePdfTool('atlas', 'sign_here', { window_id: 'pdf-1', near_text: 'tenant signature', signer: 'Sam' }, context);
  expect(out).toMatch(/Put a "Sign here" flag for Sam on page 1 of "Lease" next to "tenant signature"/);
  const doc = readPdf(pdfWin());
  const flags = Object.values(doc.marks);
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({ type: 'signHere', signer: 'Sam', by: 'atlas', page: doc.order[0], w: 180, h: 40 });
  // "Tenant signature:" sits 120pt up from the bottom of a 792pt page.
  expect(flags[0].y).toBeGreaterThan(640);
  expect(flags[0].x).toBeGreaterThan(130);
  expect(Object.values(doc.marks).some((m) => m.type === 'sign')).toBe(false);
  const read = await handlePdfTool('atlas', 'read_pdf', { window_id: 'pdf-1' }, context);
  expect(read).toContain('Sign-here flag on page 1 for Sam.');
});

test('sign_here by page, and refusals', async () => {
  await expect(handlePdfTool('atlas', 'sign_here', { window_id: 'pdf-1', page: 2 }, context)).resolves.toMatch(/on page 2 of "Lease" at the bottom of the page/);
  await expect(handlePdfTool('atlas', 'sign_here', { window_id: 'pdf-1', near_text: 'landlord' }, context)).resolves.toMatch(/^Error: "landlord" was not found/);
  await expect(handlePdfTool('atlas', 'sign_here', { window_id: 'pdf-1' }, context)).resolves.toMatch(/^Error: Say where/);
  await expect(handlePdfTool('atlas', 'sign_here', { window_id: 'pdf-1', page: 9 }, context)).resolves.toMatch(/^Error: page must be between 1 and 2/);
  getSubAgentById.mockResolvedValue({ permission: 'reviewer' });
  await expect(handlePdfTool('scout-1', 'sign_here', { window_id: 'pdf-1', page: 1 }, context)).resolves.toMatch(/reviewer sub-agents cannot change PDFs/);
  expect(Object.values(readPdf(pdfWin()).marks)).toHaveLength(1);
});

test('the PDF tools are defined, catalogued, and changes need approval', () => {
  for (const name of ['read_pdf', 'fill_pdf_field', 'sign_here']) {
    expect(TOOL_DEFINITIONS.find((tool) => tool.function.name === name)).toBeDefined();
    // The registry pulls in the whole memory module, so check its wiring as text.
    expect(readFileSync('server/tools/handlers/index.js', 'utf8')).toContain(`'${name}': handlePdfTool`);
  }
  expect(listToolCatalog().tools.find((tool) => tool.name === 'sign_here')).toMatchObject({ risk: 'write' });
  expect(CAPABILITY_TO_TOOLS['canvas.pdf.read']).toEqual(['read_pdf']);
  expect(CAPABILITY_TO_TOOLS['canvas.pdf']).toEqual(['fill_pdf_field', 'sign_here']);
});
