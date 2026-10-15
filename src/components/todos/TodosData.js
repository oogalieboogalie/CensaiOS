export function normalizeTodos(value) {
  // A new list starts empty (it used to open with four sample newsletter tasks).
  const source = Array.isArray(value) ? value : [];
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
