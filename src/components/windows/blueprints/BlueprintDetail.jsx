/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { describeBlueprintId } from '../../../lib/blueprints/blueprintIds.js';

// One blueprint, laid out like the drawing: the name in a box, the ID in a
// box under it, and the blueprint: ID / type / purpose block.
export function BlueprintDetail({ blueprint, onEdit, onDelete, busy }) {
  const [confirming, setConfirming] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => { setConfirming(false); setCopied(false); }, [blueprint.id]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(blueprint.id); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <article className="hb-bp-detail">
      <h3 className="hb-bp-title">"{blueprint.title}"</h3>
      <div className="hb-bp-id-row">
        <span className="hb-bp-id hb-bp-id-big">{blueprint.id}</span>
        <button type="button" className="hb-bp-link" onClick={copy}>{copied ? 'Copied' : 'Copy ID'}</button>
      </div>
      <p className="hb-bp-sub">{describeBlueprintId(blueprint.id)}</p>
      <pre className="hb-bp-code" aria-label="Blueprint card">
        <span>blueprint:</span>{'\n'}
        {'  '}<span className="hb-bp-k-id">ID: "{blueprint.id}",</span>{'\n'}
        {'  '}<span className="hb-bp-k-type">type: "{blueprint.type}",</span>{'\n'}
        {'  '}<span className="hb-bp-k-purpose">purpose: "{blueprint.purpose}"</span>
      </pre>
      <div className="hb-bp-eyebrow">Steps</div>
      {blueprint.body ? <div className="hb-bp-steps">{blueprint.body}</div> : <p className="hb-bp-sub">No steps written yet. Press Edit to add them.</p>}
      <p className="hb-bp-sub">{blueprint.authorKind === 'agent' ? `Saved by ${blueprint.authorId}` : 'Saved by a person'} · {new Date(blueprint.updatedAt || blueprint.createdAt).toLocaleDateString()}</p>
      <div className="hb-bp-actions">
        <button type="button" className="hb-bp-btn" onClick={onEdit}><Icon.Edit size={12} /> Edit</button>
        {confirming ? (
          <>
            <button type="button" className="hb-bp-btn hb-bp-btn-danger" disabled={busy} onClick={onDelete}>Yes, take it off the shelf</button>
            <button type="button" className="hb-bp-link" onClick={() => setConfirming(false)}>Keep it</button>
          </>
        ) : (
          <button type="button" className="hb-bp-btn" onClick={() => setConfirming(true)}>Delete</button>
        )}
      </div>
    </article>
  );
}
