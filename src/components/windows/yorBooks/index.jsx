/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// YorWare Books: Open Books, an open-source bookkeeping app, as a window
// of the YorWare Suite (docs/specs/13-yorware-suite.md). Income and expenses
// sorted into IRS Schedule C categories, a timeline with events and tracked
// numbers, receipts, rules that learn, and an AI assistant through your own
// agents. The books live on the board, so two people can keep them at once.
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { ToolIcon } from '../../creative/toolIcons.jsx';
import { typingIn } from '../../creative/useUndo.js';
import { buildScheduleC, scheduleCCsv } from '../../../lib/yorware/books/reports.js';
import { categoryTotals, unreviewedTotals } from '../../../lib/yorware/books/booksQueries.js';
import { getCategory } from '../../../lib/yorware/books/categories.js';
import { PAGES, useBooks } from '../../yorware/books/useBooks.js';
import { DashboardPage } from '../../yorware/books/DashboardPage.jsx';
import { TimelinePage } from '../../yorware/books/TimelinePage.jsx';
import { AssistantPage } from '../../yorware/books/AssistantPage.jsx';
import { TransactionsPage } from '../../yorware/books/TransactionsPage.jsx';
import { ImportPage, RulesPage } from '../../yorware/books/SetupPages.jsx';
import { ReceiptsPage } from '../../yorware/books/ReceiptsPage.jsx';
import { CategoriesPage, ReportPage } from '../../yorware/books/ReportPage.jsx';

const safe = (v) => (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v);
const cell = (raw) => {
  const v = safe(raw);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

function transactionsCsv(books) {
  const rows = [['Date', 'Description', 'Amount', 'Category', 'Tax line', 'Account', 'Notes']];
  for (const t of books.transactions) {
    const c = getCategory(t.categoryId);
    rows.push([t.date, t.description, (t.amountCents / 100).toFixed(2), c.name, c.taxLine || '', t.accountName || '', t.notes]);
  }
  return `${rows.map((r) => r.map((v) => cell(String(v))).join(',')).join('\n')}\n`;
}

const VIEWS = {
  dashboard: DashboardPage, timeline: TimelinePage, assistant: AssistantPage, transactions: TransactionsPage,
  import: ImportPage, receipts: ReceiptsPage, rules: RulesPage, categories: CategoriesPage,
};

export function YorBooksWindow({ win = {}, onUpdate }) {
  const b = useBooks(win, onUpdate);
  const { books, history, page, year } = b;
  const title = win.title || 'Open Books';
  const reportCsv = () => scheduleCCsv(buildScheduleC(categoryTotals(books, year), year), unreviewedTotals(books, year));
  const formats = [
    { ext: 'csv', label: `Tax report ${year} (Schedule C)`, hint: 'For your tax preparer', build: async () => reportCsv() },
    { ext: 'csv', label: 'All transactions', hint: 'Date, description, amount, category, tax line', build: async () => transactionsCsv(books) },
  ];
  const exportReport = () => import('../../../lib/office/officeFiles.js').then(({ saveFile }) => saveFile(reportCsv(), `schedule-c-${year}.csv`, 'csv'));
  const onKeyDown = (e) => {
    if (typingIn(e)) return;
    history.onKey(e);
  };
  const Page = VIEWS[page];
  const n = books.transactions.length;

  return (
    <>
      <WindowTitle icon={<Icon.List size={12} />} label={title} subtitle={n ? `YorWare Books · ${n} transaction${n === 1 ? '' : 's'}` : 'YorWare Books'} />
      <div className="hb-of hb-yb" tabIndex={-1} onKeyDown={onKeyDown}>
        <OfficeBar title={`${title} ${year}`} formats={formats} importHint="Import a bank or card CSV" onImport={() => b.go('import')}>
          {PAGES.map(([id, label]) => (
            <OfficeButton key={id} wide label={label} title={label} pressed={page === id} onClick={() => b.go(id)}>
              <span>{label}{id === 'transactions' && b.review > 0 ? <span className="hb-yb-badge" aria-label={`${b.review} to review`}>{b.review}</span> : null}</span>
            </OfficeButton>
          ))}
          <OfficeSep />
          <OfficeButton label="Undo" title="Undo (Ctrl+Z)" icon={<ToolIcon.Undo />} disabled={!history.canUndo} onClick={history.undo} />
          <OfficeButton label="Redo" title="Redo (Ctrl+Shift+Z)" icon={<ToolIcon.Redo />} disabled={!history.canRedo} onClick={history.redo} />
        </OfficeBar>
        {b.notice && (
          <div role={b.notice.kind === 'error' ? 'alert' : 'status'} className="hb-of-alert" data-tone={b.notice.kind}>
            <span>{b.notice.text}</span>
            <button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => b.setNotice(null)}><Icon.Close size={10} /></button>
          </div>
        )}
        <main className="hb-yb-main" data-no-drag>
          <div className="hb-yb-page">
            {page === 'report' ? <ReportPage b={b} onExport={exportReport} /> : <Page b={b} />}
            <footer className="hb-yb-footer hb-yb-muted">Open Books is free, open-source software. It helps you organize your records; it is not tax or legal advice.</footer>
          </div>
        </main>
      </div>
    </>
  );
}

export default YorBooksWindow;
