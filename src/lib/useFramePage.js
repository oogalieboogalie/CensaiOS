import React from 'react';

// A frame whose page is swapped while the page before it is still loading
// can keep showing that older page: Chromium now and then drops the newer
// srcdoc. A teammate's Local Sites preview kept the kind of shop's own page
// after the owner's shop name had reached their form (backlog 208). So the
// frame gets one page at a time: the newest goes in once the frame has loaded
// the one before it, or after a few seconds if that page never says so.
const SETTLE_MS = 4000;

/**
 * @param {string} html the page the frame should show
 * @returns {[string, () => void]} the page to give the frame's srcDoc now, and its onLoad
 */
export function useFramePage(html, settleMs = SETTLE_MS) {
  const [page, setPage] = React.useState(html);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (loading || html === page) return;
    setPage(html);
    setLoading(true);
  }, [html, page, loading]);

  React.useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => setLoading(false), settleMs);
    return () => clearTimeout(timer);
  }, [loading, page, settleMs]);

  const onLoad = React.useCallback(() => setLoading(false), []);
  return [page, onLoad];
}
