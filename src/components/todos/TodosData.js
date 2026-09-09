export const DEFAULT_TODOS = [
  { id: 1, text: 'Define newsletter sections + tone', done: false, assignee: 'censai' },
  { id: 2, text: 'Scrape last week’s top AI stories', done: true,  assignee: 'atlas' },
  { id: 3, text: 'Draft cover art direction',          done: false, assignee: 'genesis' },
  { id: 4, text: 'Build subscriber funnel',            done: false, assignee: null },
];

export function normalizeTodos(value) {
  const source = Array.isArray(value) ? value : DEFAULT_TODOS;
  return source.filter(Boolean).map((item, index) => {
    const text = String(item.text ?? item.title ?? item.name ?? '').trim();
    return {
      ...item,
      id: item.id ?? `todo-${index}`,
      text: text || 'Untitled task',
      done: Boolean(item.done),
      assignee: item.assignee || null,
    };
  });
}
