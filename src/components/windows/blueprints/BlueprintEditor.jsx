/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { BLUEPRINT_SHELVES } from '../../../lib/blueprints/blueprintIds.js';

const DRAWING_EXAMPLE = {
  title: 'Alma Finance Blueprint for Budgeting',
  shelf: 1,
  type: 'Budget',
  purpose: 'Personal Financing',
  body: '1. Add up what comes in each month\n2. List every bill and when it is due\n3. Set aside savings first\n4. Split what is left into weekly spending',
};

// Write or edit a blueprint. A new one gets its ID when it is saved; the
// shelf is part of the ID, so an existing blueprint keeps its shelf.
export function BlueprintEditor({ draft, onSave, onCancel, busy }) {
  const [form, setForm] = React.useState(() => ({ title: '', type: '', purpose: '', body: '', ...draft }));
  const isNew = !draft.id;
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const submit = (event) => { event.preventDefault(); onSave({ ...form, shelf: Number(form.shelf) || 3 }); };
  return (
    <form className="hb-bp-detail" onSubmit={submit}>
      <div className="hb-bp-head">
        <h3 className="hb-bp-h">{isNew ? 'New blueprint' : `Edit ${draft.id}`}</h3>
        {isNew && <button type="button" className="hb-bp-link" onClick={() => setForm({ ...DRAWING_EXAMPLE })}>Fill in the example from your drawing</button>}
      </div>
      <label className="hb-bp-field">Name
        <input className="hb-bp-input" value={form.title} onChange={set('title')} placeholder="Alma Finance Blueprint for Budgeting" required />
      </label>
      <div className="hb-bp-row">
        <label className="hb-bp-field">Shelf
          <select className="hb-bp-input" value={form.shelf} onChange={set('shelf')} disabled={!isNew}>
            {BLUEPRINT_SHELVES.map((s) => <option key={s.number} value={s.number}>{s.number} - {s.name}</option>)}
          </select>
        </label>
        <label className="hb-bp-field">Type
          <input className="hb-bp-input" value={form.type} onChange={set('type')} placeholder="Budget" />
        </label>
        <label className="hb-bp-field">Purpose
          <input className="hb-bp-input" value={form.purpose} onChange={set('purpose')} placeholder="Personal Financing" />
        </label>
      </div>
      <label className="hb-bp-field">Steps
        <textarea className="hb-bp-input hb-bp-text" rows={8} value={form.body} onChange={set('body')} placeholder="What to do, one step per line" />
      </label>
      {isNew && <p className="hb-bp-sub">It gets its ID when you save: shelf number, its number on that shelf, a short code, and the year.</p>}
      <div className="hb-bp-actions">
        <button type="submit" className="hb-bp-btn hb-bp-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save blueprint'}</button>
        <button type="button" className="hb-bp-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
