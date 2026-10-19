// server/apiBar/paging.js
//
// Paging, done once in the bar for every branch: the API behind a branch
// hands back its whole list, and the bar cuts the page the caller asked for.

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function wantsPaging(value) {
  return value === true || ['true', '1', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

export function pageOptions(bar = {}) {
  const page = Math.max(1, Math.floor(Number(bar.page) || 1));
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(bar.page_size ?? bar.pageSize) || DEFAULT_PAGE_SIZE)));
  return { page, pageSize: size };
}

/**
 * Cut one page out of data[listKey].
 * Returns { data, paging } where paging is null when nothing was paged.
 */
export function pageAnswer(data, listKey, bar = {}) {
  if (!listKey || !wantsPaging(bar.paginate) || !data || typeof data !== 'object') return { data, paging: null };
  const list = Array.isArray(data) ? data : data[listKey];
  if (!Array.isArray(list)) return { data, paging: null };
  const { page, pageSize } = pageOptions(bar);
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize);
  const total = list.length;
  const hasMore = start + items.length < total;
  const paged = Array.isArray(data) ? { [listKey]: items } : { ...data, [listKey]: items };
  return {
    data: paged,
    paging: { page, page_size: pageSize, total, has_more: hasMore, next_page: hasMore ? page + 1 : null },
  };
}
