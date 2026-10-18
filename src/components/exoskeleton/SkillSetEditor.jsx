import React from 'react';

const ORIGIN_WORDS = { builtin: 'Built-in', research: 'Researched', foundry: 'From Idea Foundry', manual: 'Yours' };

export function originLabel(set) {
  if (set.builtin && set.edited) return 'Built-in, edited';
  return ORIGIN_WORDS[set.origin] || 'Yours';
}

function SkillCards({ skills }) {
  return (
    <div className="hb-sk-grid" data-testid="skill-set-skills">
      {skills.map((skill, index) => (
        <div className="hb-sk-skill" key={`${index}-${skill.title}`}>
          <span className="hb-sk-skill-n">{index + 1}</span>
          <span className="hb-sk-skill-title">{skill.title}</span>
          {skill.detail && <span className="hb-sk-skill-detail">{skill.detail}</span>}
        </div>
      ))}
    </div>
  );
}

function SkillFields({ form, setForm }) {
  const setSkill = (index, patch) => setForm((f) => ({ ...f, skills: f.skills.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {form.skills.map((skill, index) => (
        <div className="hb-sk-card" key={index}>
          <div className="hb-sk-row">
            <span className="hb-sk-skill-n">{index + 1}</span>
            <input className="hb-sk-input" aria-label={`Skill ${index + 1} title`} value={skill.title} placeholder="Skill name" onChange={(e) => setSkill(index, { title: e.target.value })} />
            <button type="button" className="hb-sk-link" onClick={() => setForm((f) => ({ ...f, skills: f.skills.filter((_, i) => i !== index) }))}>Remove</button>
          </div>
          <textarea className="hb-sk-text" rows={2} aria-label={`Skill ${index + 1} detail`} value={skill.detail} placeholder="What the best people actually do" onChange={(e) => setSkill(index, { detail: e.target.value })} />
        </div>
      ))}
      {form.skills.length < 15 && (
        <button type="button" className="hb-sk-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setForm((f) => ({ ...f, skills: [...f.skills, { title: '', detail: '' }] }))}>Add a skill</button>
      )}
    </div>
  );
}

export function SkillSetEditor({ set, isDraft, agentName, equipped, busy, onSave, onRemove, onDiscard, onToggleEquip }) {
  const [editing, setEditing] = React.useState(isDraft);
  const [form, setForm] = React.useState(set);
  React.useEffect(() => { setForm(set); setEditing(isDraft); }, [set, isDraft]);

  if (editing) {
    const save = () => onSave({ ...form, skills: form.skills.filter((s) => s.title.trim()) });
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="skill-set-editor">
        <div className="hb-sk-eyebrow">{isDraft ? 'Draft: check it, change anything, then save' : 'Editing'}</div>
        <input className="hb-sk-input" aria-label="Skill set name" value={form.name} placeholder="Skill set name, e.g. Real Estate" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="hb-sk-input" aria-label="Position" value={form.position} placeholder="Position, e.g. Real estate agent" onChange={(e) => setForm({ ...form, position: e.target.value })} />
        <SkillFields form={form} setForm={setForm} />
        <textarea className="hb-sk-text" rows={2} aria-label="Benchmark" value={form.benchmark} placeholder="Benchmark: a good one does this; a great one does that" onChange={(e) => setForm({ ...form, benchmark: e.target.value })} />
        <div className="hb-sk-row">
          <button type="button" className="hb-sk-btn hb-sk-btn-primary" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Saving' : isDraft ? 'Save to library' : 'Save'}</button>
          <button type="button" className="hb-sk-btn" onClick={() => (isDraft ? onDiscard() : setEditing(false))}>{isDraft ? 'Discard' : 'Cancel'}</button>
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="skill-set-view">
      <div className="hb-sk-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="hb-sk-eyebrow">{originLabel(set)}{set.position ? ` · ${set.position}` : ''}</div>
          <h3 className="hb-sk-h">{set.name}</h3>
          {set.summary && <p className="hb-sk-sub">{set.summary}</p>}
        </div>
        <button type="button" data-testid="skill-set-equip" className={`hb-sk-btn${equipped ? '' : ' hb-sk-btn-primary'}`} disabled={busy === 'equip'} onClick={onToggleEquip}>
          {equipped ? `Unequip from ${agentName}` : `Equip to ${agentName}`}
        </button>
      </div>
      <SkillCards skills={set.skills} />
      {set.benchmark && <div className="hb-sk-bench">{set.benchmark}</div>}
      {set.sources?.length > 0 && <p className="hb-sk-sub">Sources: {set.sources.join(' · ')}</p>}
      <div className="hb-sk-row">
        <button type="button" className="hb-sk-btn" onClick={() => setEditing(true)}>Edit</button>
        {set.builtin && set.edited && <button type="button" className="hb-sk-link" onClick={() => onRemove(set)}>Put back the original</button>}
        {!set.builtin && <button type="button" className="hb-sk-link" onClick={() => onRemove(set)}>Delete</button>}
      </div>
    </section>
  );
}
