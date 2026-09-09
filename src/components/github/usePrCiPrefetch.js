import { useCallback, useRef } from 'react';
import { api } from '../../lib/api.js';

// Prefetches CI details for every open PR so status dots and the green
// merge button render without expanding each row. Split out of
// useGithubConsole to respect the size ratchet.
export function usePrCiPrefetch(selectedRepo, setPrDetails, setMergeOptions) {
  const prefetched = useRef(new Set());
  const reset = useCallback(() => { prefetched.current = new Set(); }, []);

  const prefetch = useCallback(async (list) => {
    if (!selectedRepo || !Array.isArray(list) || list.length === 0) return;
    const pending = list.filter((pr) => pr?.number && !prefetched.current.has(pr.number));
    if (pending.length === 0) return;
    for (const pr of pending) prefetched.current.add(pr.number);
    const results = await Promise.allSettled(
      pending.map((pr) => api.getGithubPullDetails(selectedRepo, pr.number)
        .then((details) => ({ number: pr.number, details }))),
    );
    setPrDetails((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.details) next[r.value.number] = r.value.details;
      }
      return next;
    });
    setMergeOptions((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.details?.pr && !next[r.value.number]) {
          next[r.value.number] = {
            commit_title: r.value.details.pr.title || '',
            commit_message: '',
            merge_method: 'merge',
          };
        }
      }
      return next;
    });
  }, [selectedRepo, setPrDetails, setMergeOptions]);

  return { prefetchPrCi: prefetch, resetPrCiPrefetch: reset };
}
