/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { hostOf, shortDate } from '../../../lib/research/researchApi.js';

export function KnowledgePanel({ research }) {
  const { kb, readOnly, busy, status, lastSave } = research;
  const chunks = kb.reduce((n, s) => n + (s.chunkCount || 0), 0);
  return (
    <div className="hb-rs-panel">
      <div className="hb-rs-head">
        <span className="hb-rs-head-q">Knowledge base</span>
        <span className="hb-lh-mono">{kb.length} {kb.length === 1 ? 'source' : 'sources'} · {chunks} chunks</span>
      </div>
      {!readOnly && (
        <div className="hb-rs-note">
          Saved pages are fetched in full with Tavily, cut into chunks and indexed for this board.
          {' '}Retrieval: {status.embedding || 'keyword ranking'}{lastSave?.count ? `. Last save added ${lastSave.count}.` : '.'}
        </div>
      )}
      {kb.length === 0 ? (
        <div className="hb-rs-empty"><p>Nothing saved yet. Search, then use Save to board on a result or the whole search.</p></div>
      ) : (
        <table className="hb-rs-kb">
          <thead>
            <tr><th>Source</th><th>Saved</th><th className="hb-rs-num">Chunks</th>{!readOnly && <th aria-label="Delete" />}</tr>
          </thead>
          <tbody>
            {kb.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}
                  <div className="hb-rs-meta">
                    <span>{hostOf(s.url)}</span>
                    {s.publishedAt && <span>published {shortDate(s.publishedAt)}</span>}
                    {s.query && <span title="Search it came from">“{s.query}”</span>}
                  </div>
                </td>
                <td className="hb-lh-mono">{shortDate(s.savedAt)}</td>
                <td className="hb-rs-num hb-lh-mono">{s.chunkCount}</td>
                {!readOnly && (
                  <td>
                    <button type="button" className="hb-icon-btn" disabled={Boolean(busy)} onClick={() => research.remove(s.id)}
                      aria-label={`Delete ${s.title}`} title="Delete from the knowledge base"><Icon.Close size={11} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
