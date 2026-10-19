import React from 'react';
import { useSkillSets } from './useSkillSets.js';
import { SkillSetEditor, originLabel } from './SkillSetEditor.jsx';
import { SkillSetLog } from './SkillSetLog.jsx';
import { SkillSetMindsets } from './SkillSetMindsets.jsx';
import { IdeaFoundryCard } from './IdeaFoundryCard.jsx';

// Exo-Skeleton > Skill sets: "Skill sets are granular lists of skills that
// are combined to superpower your agent." Research a position, edit the
// result, equip it; keep a log of what worked and what didn't.
export function SkillSetsTab({ agent }) {
  const s = useSkillSets(agent);
  const [position, setPosition] = React.useState('');
  const research = (e) => { e.preventDefault(); if (position.trim()) s.research(position.trim()); };
  const selected = s.selected;

  return (
    <div className="hb-sk" data-testid="skill-sets-tab">
      <aside className="hb-sk-lib">
        <form className="hb-sk-research" onSubmit={research}>
          <span className="hb-sk-eyebrow">Research a position</span>
          <div className="hb-sk-row">
            <input className="hb-sk-input" data-testid="skill-set-position" value={position} placeholder="e.g. real estate agent" onChange={(e) => setPosition(e.target.value)} />
            <button type="submit" className="hb-sk-btn hb-sk-btn-primary" disabled={s.busy === 'research' || !position.trim()}>{s.busy === 'research' ? 'Researching' : 'Research'}</button>
          </div>
          <span className="hb-sk-sub">Finds what makes someone great, not just good, at it and turns that into ten skills. Uses your own AI key.</span>
        </form>
        <IdeaFoundryCard workspaceId={s.workspaceId} onGrew={s.reload} />
        <div className="hb-sk-row" style={{ justifyContent: 'space-between' }}>
          <span className="hb-sk-eyebrow">Library ({s.library.length})</span>
          <button type="button" className="hb-sk-link" onClick={s.newBlank}>Write one yourself</button>
        </div>
        <div className="hb-sk-list">
          {s.library.map((set) => {
            const on = s.equippedIds.includes(set.id);
            return (
              <button type="button" key={set.id} className="hb-sk-item" aria-current={!s.isDraft && selected?.id === set.id} onClick={() => s.select(set.id)}>
                <span className="hb-sk-item-top">
                  <span className="hb-sk-item-name">{set.name}</span>
                  {on && <span className="hb-sk-badge hb-sk-badge-on">Equipped</span>}
                </span>
                <span className="hb-sk-item-meta">{originLabel(set)} · {set.skills.length} skills{set.mindsetCount ? ` · ${set.mindsetCount} mindsets` : ''}</span>
              </button>
            );
          })}
        </div>
      </aside>
      <main className="hb-sk-main">
        {s.error && <div className="hb-sk-error" role="alert">{s.error}</div>}
        {selected ? (
          <>
            <SkillSetEditor
              set={selected}
              isDraft={s.isDraft}
              agentName={agent.name}
              equipped={s.equippedIds.includes(selected.id)}
              busy={s.busy}
              onSave={s.save}
              onRemove={s.remove}
              onDiscard={s.discardDraft}
              onToggleEquip={() => s.toggleEquip(selected.id)}
            />
            {!s.isDraft && (
              <SkillSetMindsets mindsets={s.mindsets} skills={selected.skills} busy={s.busy}
                onAddSkill={(skill) => s.save({ ...selected, skills: [...selected.skills, skill] })} />
            )}
            {!s.isDraft && <SkillSetLog log={s.log} busy={s.busy} onAdd={s.addLog} />}
          </>
        ) : <p className="hb-sk-sub">Loading the library.</p>}
      </main>
    </div>
  );
}
