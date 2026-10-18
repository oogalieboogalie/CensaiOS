/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { BLUEPRINT_SHELVES } from '../../../lib/blueprints/blueprintIds.js';
import { useBlueprints } from './useBlueprints.js';
import { BlueprintAsk } from './BlueprintAsk.jsx';
import { BlueprintList } from './BlueprintList.jsx';
import { BlueprintDetail } from './BlueprintDetail.jsx';
import { BlueprintEditor } from './BlueprintEditor.jsx';
import { BlueprintPhrases } from './BlueprintPhrases.jsx';
import { windowMeta } from './meta.js';

export { windowMeta };

/**
 * Blueprints, from Alex's diagram 08: a board's shelf of recipes that worked
 * ("Alex Finance Blueprint for Budgeting"), each with an ID like
 * 14h7*skyFs^2026 (shelf, number on the shelf, code, year). Asking
 * "Do we have ..." here, or to any agent in chat, looks on this shelf first.
 */
export function BlueprintsWindow({ win = {} }) {
  const bp = useBlueprints();
  const [tab, setTab] = React.useState('shelf');
  const pickShelf = (number) => { bp.setAnswer(null); bp.setShelf(number); setTab('shelf'); };

  return (
    <>
      <WindowTitle icon={<Icon.Files size={12} />} label={win.title || windowMeta.label} subtitle={`${bp.blueprints.length} on the shelf`} />
      <div className="hb-bp">
        <BlueprintAsk onAsk={bp.ask} busy={bp.busy === 'ask'} answer={bp.answer} onClear={() => bp.setAnswer(null)} />
        <nav className="hb-bp-tabs" aria-label="Shelves">
          <button type="button" className="hb-bp-tab" aria-current={tab === 'shelf' && !bp.shelf && !bp.answer} onClick={() => pickShelf(0)}>All</button>
          {BLUEPRINT_SHELVES.map((s) => (
            <button key={s.number} type="button" className="hb-bp-tab" aria-current={tab === 'shelf' && bp.shelf === s.number && !bp.answer} onClick={() => pickShelf(s.number)}>
              <span className="hb-bp-tab-n">{s.number}</span> {s.name}
            </button>
          ))}
          <span className="hb-bp-spacer" />
          <button type="button" className="hb-bp-tab" aria-current={tab === 'phrases'} onClick={() => setTab('phrases')}>"Do we have" phrases</button>
        </nav>
        {bp.error && <p className="hb-bp-error" role="alert">{bp.error}</p>}
        {!bp.workspaceId ? (
          <p className="hb-bp-empty">Open a board to keep blueprints on it.</p>
        ) : tab === 'phrases' ? (
          <BlueprintPhrases phrases={bp.phrases} defaults={bp.defaults} onSave={bp.savePhrases} busy={bp.busy === 'phrases'} />
        ) : (
          <div className="hb-bp-body">
            <BlueprintList
              blueprints={bp.shown}
              selectedId={bp.selected?.id}
              onSelect={(id) => { bp.setDraft(null); bp.setSelectedId(id); }}
              onNew={() => bp.setDraft({ shelf: bp.shelf || 1 })}
              searching={Boolean(bp.answer)}
            />
            <div className="hb-bp-main">
              {bp.draft ? (
                <BlueprintEditor key={bp.draft.id || 'new'} draft={bp.draft} onSave={bp.save} onCancel={() => bp.setDraft(null)} busy={bp.busy === 'save'} />
              ) : bp.selected ? (
                <BlueprintDetail blueprint={bp.selected} onEdit={() => bp.setDraft({ ...bp.selected })} onDelete={() => bp.remove(bp.selected.id)} busy={bp.busy === 'delete'} />
              ) : (
                <BlueprintEmpty count={bp.blueprints.length} onNew={() => bp.setDraft({ shelf: bp.shelf || 1 })} />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function BlueprintEmpty({ count, onNew }) {
  return (
    <div className="hb-bp-empty">
      <p className="hb-bp-h">{count ? 'Pick a blueprint on the left.' : 'No blueprints on this board yet.'}</p>
      <p className="hb-bp-sub">A blueprint is a recipe that worked, saved with its own ID so you and your agents can find it again. Ask an agent "Do we have any budget blueprints?" and it looks here first.</p>
      <button type="button" className="hb-bp-btn hb-bp-btn-primary" onClick={onNew}><Icon.Plus size={12} /> New blueprint</button>
    </div>
  );
}

export default BlueprintsWindow;
