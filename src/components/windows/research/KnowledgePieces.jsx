import React from 'react';
import { researchApi } from '../../../lib/research/researchApi.js';

/** A source's tags as small chips. */
export function TagChips({ tags = [] }) {
  if (!tags.length) return null;
  return (
    <span className="hb-rs-tags" data-testid="kb-tags">
      {tags.map((tag) => <span key={tag} className="hb-rs-tag">{tag}</span>)}
    </span>
  );
}

/** The pieces one source was cut into, each with its own tags (diagram 13). */
export function KnowledgePieces({ sourceId }) {
  const [chunks, setChunks] = React.useState(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let live = true;
    researchApi.chunks(sourceId)
      .then((data) => { if (live) setChunks(data.chunks || []); })
      .catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [sourceId]);
  if (error) return <div className="hb-rs-note">{error}</div>;
  if (!chunks) return <div className="hb-rs-note">Loading the pieces…</div>;
  return (
    <ol className="hb-rs-pieces" data-testid="kb-pieces">
      {chunks.map((chunk) => (
        <li key={chunk.ord} className="hb-rs-piece">
          <div className="hb-rs-piece-text">{chunk.text.length > 220 ? `${chunk.text.slice(0, 220)}…` : chunk.text}</div>
          <TagChips tags={chunk.tags} />
        </li>
      ))}
    </ol>
  );
}
