/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

/** Numbered sources under an answer that used the board's knowledge base. */
export function KnowledgeSources({ sources, label = 'Sources' }) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  return (
    <ol className="hb-kb-sources" aria-label={label} data-testid="knowledge-sources">
      {sources.map((s) => (
        <li key={`${s.n}-${s.url || s.title}`}>
          <span className="hb-kb-n">{s.n}</span>
          {s.url ? <a href={s.url} target="_blank" rel="noreferrer" title={s.url}>{s.title || s.url}</a> : <span>{s.title}</span>}
        </li>
      ))}
    </ol>
  );
}
