// Spec 7: the Transaction Coordinator's view of the Deal pipeline module's
// deadline checklists (stored in the module's data on the canvas).

const DAY = 86400000;

function parseDay(value) {
  const [y, m, d] = String(value || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

/** Open deadlines due within `daysAhead` days (overdue included), soonest first. */
export function dueDeadlines(deals, { today = new Date(), daysAhead = 7 } = {}) {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const items = [];
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (deal?.stage === 'Closed') continue;
    for (const item of Array.isArray(deal?.checklist) ? deal.checklist : []) {
      if (item?.done) continue;
      const due = parseDay(item?.due);
      if (due === null) continue;
      const days = Math.round((due - start) / DAY);
      if (days > daysAhead) continue;
      items.push({ deal: deal.client || '', address: deal.address || '', deadline: item.label, due: item.due, days });
    }
  }
  return items.sort((a, b) => a.days - b.days || a.deal.localeCompare(b.deal));
}

export function describeDeadline(item) {
  const when = item.days < 0 ? `${Math.abs(item.days)} day${item.days === -1 ? '' : 's'} overdue`
    : item.days === 0 ? 'due today'
      : item.days === 1 ? 'due tomorrow'
        : `due in ${item.days} days`;
  return `${item.deal} (${item.address}): ${item.deadline} ${when} (${item.due})`;
}
