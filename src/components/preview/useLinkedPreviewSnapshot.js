import React from 'react';

export function useLinkedPreviewSnapshot(preview, persistedHtml, onUpdate) {
  const lastSnapshotRef = React.useRef(persistedHtml || '');

  React.useEffect(() => {
    lastSnapshotRef.current = persistedHtml || '';
  }, [persistedHtml]);

  React.useEffect(() => {
    if (!preview.linked || typeof onUpdate !== 'function') return;
    if (preview.html === lastSnapshotRef.current) return;
    lastSnapshotRef.current = preview.html;
    onUpdate({ html: preview.html });
  }, [onUpdate, preview.html, preview.linked]);
}
