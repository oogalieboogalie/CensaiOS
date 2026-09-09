import React, { useState, useEffect } from 'react';
import { Icon } from '../Icons.jsx';

export function RelatedContext({ workspaceId, query, artifactId }) {
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchRelated() {
      setLoading(true);
      try {
        const url = artifactId
          ? `/api/context/feed?workspaceId=${workspaceId}&limit=5`
          : `/api/context/search?workspaceId=${workspaceId}&q=${encodeURIComponent(query)}&limit=5`;
        const res = await fetch(url);
        const data = await res.json();
        setRelated(data);
      } catch (err) {
        console.error('Failed to fetch related context', err);
      } finally {
        setLoading(false);
      }
    }
    if (workspaceId && (query || artifactId)) {
      fetchRelated();
    }
  }, [workspaceId, query, artifactId]);

  if (loading) return <div className="text-[10px] text-[var(--ink-faint)] p-2 animate-pulse">Scanning context...</div>;
  if (related.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-dashed border-[var(--hairline)]">
      <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] px-1">Related Context</div>
      {related.map(item => (
        <div key={item.id} className="flex flex-col gap-0.5 p-2 bg-[var(--surface)] border border-[var(--hairline)] rounded hover:border-[var(--accent)] transition-colors cursor-pointer overflow-hidden">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold truncate pr-2">{item.title}</span>
            <span className="text-[8px] uppercase font-black text-[var(--accent)] shrink-0">{item.data?.provider || 'Hub'}</span>
          </div>
          <div className="text-[9px] text-[var(--ink-soft)] line-clamp-1">{item.data?.text || item.data?.description}</div>
        </div>
      ))}
    </div>
  );
}
