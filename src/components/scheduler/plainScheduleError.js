const RAW_DATABASE = /violates|foreign key|duplicate key|syntax error|sqlstate|deadlock|update or delete on table|insert or update on table|null value in column|relation "|column "|current transaction is aborted/i;

/** A database complaint becomes one plain sentence. Ordinary sentences pass through. */
export function plainScheduleError(message) {
  const text = String(message ?? '').trim();
  if (!text) return '';
  if (RAW_DATABASE.test(text)) return 'The schedule could not be changed. Try again in a moment.';
  return text;
}

/** A quiet refresh must not wipe an error left by delete or save. A failed load may. */
export function shouldClearScheduleError({ quiet = false, loadFailed = false } = {}) {
  return !quiet || Boolean(loadFailed);
}
