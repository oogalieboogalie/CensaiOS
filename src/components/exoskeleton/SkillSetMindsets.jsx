import React from 'react';

// The mindsets the Idea Foundry researched for this profession, in their
// own words. Any of them can be added to the skill set as one more skill.
export function SkillSetMindsets({ mindsets, skills, onAddSkill, busy }) {
  const [open, setOpen] = React.useState(false);
  if (!mindsets.length) return null;
  const have = new Set(skills.map((s) => s.title.toLowerCase()));
  return (
    <section className="hb-sk-card" data-testid="skill-set-mindsets">
      <button type="button" className="hb-sk-row" onClick={() => setOpen((o) => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
        <span>
          <span className="hb-sk-h">Mindsets from your Idea Foundry ({mindsets.length})</span>
          <span className="hb-sk-sub" style={{ display: 'block' }}>What your research found makes someone great at this. Add any of them as a skill.</span>
        </span>
        <span className="hb-sk-link">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="hb-sk-grid">
          {mindsets.map((m) => {
            const added = have.has(m.name.toLowerCase());
            return (
              <div className="hb-sk-skill" key={`${m.issue}-${m.name}`}>
                <span className="hb-sk-skill-title">{m.name}</span>
                {m.definition && <span className="hb-sk-skill-detail">{m.definition}</span>}
                {m.howTo?.length > 0 && (
                  <details>
                    <summary className="hb-sk-item-meta" style={{ cursor: 'pointer' }}>How the agent does it ({m.howTo.length})</summary>
                    <ol className="hb-sk-skill-detail" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{m.howTo.map((step) => <li key={step}>{step}</li>)}</ol>
                  </details>
                )}
                {m.alsoFrom?.length > 0 && (
                  <span className="hb-sk-item-meta">Same idea as: {m.alsoFrom.map((a) => `${a.name} (#${a.issue})`).join(', ')}</span>
                )}
                <div className="hb-sk-row" style={{ justifyContent: 'space-between' }}>
                  <span className="hb-sk-item-meta">Research note #{m.issue}</span>
                  <button type="button" className="hb-sk-link" disabled={added || busy === 'save'} onClick={() => onAddSkill({ title: m.name, detail: m.definition })}>{added ? 'In the set' : 'Add as a skill'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
