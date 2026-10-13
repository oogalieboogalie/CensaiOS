/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { LAYOUT_TEMPLATES, templatePatch } from '../../../lib/yorware/layoutTemplates.js';
import { readLayout } from '../../../lib/yorware/layoutModel.js';
import { flowDocument, pageItems } from '../../../lib/yorware/layoutPlan.js';
import { LayoutThumb } from './LayoutItem.jsx';

// The templates are drawn from the real documents they make, once.
const PREVIEWS = LAYOUT_TEMPLATES.map((t) => {
  const doc = readLayout(templatePatch(t.id));
  return { ...t, doc, items: pageItems(doc, doc.order[0], flowDocument(doc)) };
});

/** The empty window: pick a starting point. */
export function LayoutStart({ onPick }) {
  return (
    <div className="hb-yl-start">
      <div className="hb-yl-start-title">Start a layout</div>
      <p className="hb-cr-hint">Flyers, menus, listing sheets and newsletters. Text flows from frame to frame and page to page, and Export makes a print-ready PDF. Everyone on the board sees the same pages.</p>
      <ul className="hb-yl-templates">
        {PREVIEWS.map((t) => (
          <li key={t.id}>
            <button type="button" className="hb-yl-template" onClick={() => onPick(t.id)}>
              <LayoutThumb doc={t.doc} items={t.items} scale={120 / t.doc.w} label={`${t.label} preview`} />
              <span className="hb-yl-template-name">{t.label}</span>
              <span className="hb-yl-template-hint">{t.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
