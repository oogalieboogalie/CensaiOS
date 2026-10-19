/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { hostOf, shortDate } from '../../../lib/research/researchApi.js';
import { KnowledgePieces, TagChips } from './KnowledgePieces.jsx';

const FILE_TYPES = '.txt,.md,.markdown,.csv,.json,.html,.htm,.log';

export function KnowledgePanel({ research }) {
  const { kb, readOnly, busy, status, lastSave } = research;
  const chunks = kb.reduce((n, s) => n + (s.chunkCount || 0), 0);
  const [open, setOpen] = React.useState(null);
  const fileRef = React.useRef(null);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const source = await research.saveFile(file);
    if (source?.id) setOpen(source.id);
  };
  return (
    <div className="hb-rs-panel">
      <div className="hb-rs-head">
        <span className="hb-rs-head-q">Knowledge base</span>
        <span className="hb-lh-mono">{kb.length} {kb.length === 1 ? 'source' : 'sources'} · {chunks} chunks</span>
        {!readOnly && (
          <>
            <button type="button" className="hb-lh-pill" data-size="sm" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>Add a file</button>
            <input ref={fileRef} type="file" accept={FILE_TYPES} hidden onChange={onFile} data-testid="kb-file-input" />
          </>
        )}
      </div>
      {!readOnly && (
        <div className="hb-rs-note">
          Saved pages and files are cut into pieces (one per step when they have steps), every piece is tagged, and all of it is indexed for this board.
          {' '}Retrieval: {status.embedding || 'keyword ranking'}{lastSave?.count ? `. Last save added ${lastSave.count}.` : '.'}
        </div>
      )}
      {kb.length === 0 ? (
        <div className="hb-rs-empty"><p>Nothing saved yet. Search, then use Save to board, or add a file.</p></div>
      ) : (
        <table className="hb-rs-kb">
          <thead>
            <tr><th>Source</th><th>Saved</th><th className="hb-rs-num">Chunks</th>{!readOnly && <th aria-label="Delete" />}</tr>
          </thead>
          <tbody>
            {kb.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.url && !s.url.startsWith('file:') ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}
                  <div className="hb-rs-meta">
                    <span>{s.url?.startsWith('file:') ? 'file' : hostOf(s.url)}</span>
                    {s.publishedAt && <span>published {shortDate(s.publishedAt)}</span>}
                    {s.kind === 'how-to' && <span>how-to</span>}
                    {s.query && <span title="Search it came from">“{s.query}”</span>}
                  </div>
                  <TagChips tags={s.tags} />
                  <button type="button" className="hb-rs-link" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                    {open === s.id ? 'Hide the pieces' : `Show the ${s.chunkCount} ${s.chunkCount === 1 ? 'piece' : 'pieces'}`}
                  </button>
                  {open === s.id && <KnowledgePieces sourceId={s.id} />}
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
