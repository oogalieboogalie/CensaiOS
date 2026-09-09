import React from 'react';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';

function definitionLabels(attributes, mindsets) {
  return Object.fromEntries([...attributes, ...mindsets].map(item => [item.id, item.name]));
}

export function FamilyRecipePanel({ allAttributes, allMindsets, onApplied }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [recipe, setRecipe] = React.useState(null);
  const [reviewing, setReviewing] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState('');
  const labels = definitionLabels(allAttributes, allMindsets);

  React.useEffect(() => {
    let active = true;
    setRecipe(null);
    setReviewing(false);
    setError('');
    if (!workspaceId) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    api.getFamilyEquipmentRecipes(workspaceId)
      .then(result => {
        if (active && useWorkspaceStore.getState().workspaceId === workspaceId) {
          setRecipe(result.recipes?.[0] || null);
        }
      })
      .catch(requestError => {
        if (active) setError(requestError.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceId]);

  async function applyRecipe() {
    setApplying(true);
    setError('');
    const requestedWorkspace = workspaceId;
    try {
      const result = await api.applyFamilyEquipmentRecipe(recipe.id, recipe.hash, requestedWorkspace);
      if (useWorkspaceStore.getState().workspaceId !== requestedWorkspace) return;
      setRecipe(result.recipe);
      setReviewing(false);
      onApplied?.();
    } catch (requestError) {
      if (useWorkspaceStore.getState().workspaceId === requestedWorkspace) setError(requestError.message);
    } finally {
      if (useWorkspaceStore.getState().workspaceId === requestedWorkspace) setApplying(false);
    }
  }

  if (loading) return <div role="status" style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Loading team setup…</div>;
  if (!recipe) return error ? <div role="alert" style={{ fontSize: 10, color: 'var(--danger)' }}>{error}</div> : null;

  return (
    <section style={{ display: 'grid', gap: 10, padding: 13, borderRadius: 10, border: '1px solid var(--hairline)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
        <div>
          <div style={{ color: 'var(--accent)', fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Recommended team setup</div>
          <h3 style={{ margin: '3px 0', fontSize: 13, color: 'var(--ink)' }}>{recipe.name}</h3>
          <p style={{ margin: 0, maxWidth: 620, fontSize: 10, lineHeight: 1.45, color: 'var(--ink-soft)' }}>{recipe.description}</p>
        </div>
        <span style={{ padding: '4px 7px', borderRadius: 999, border: '1px solid var(--hairline)', color: recipe.applied ? 'var(--accent)' : 'var(--ink-soft)', fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>
          {recipe.applied ? 'Applied' : `${recipe.differenceCount} changes`}
        </span>
      </div>

      <div style={{ padding: '8px 9px', borderRadius: 7, background: 'var(--surface-2)', color: 'var(--ink-soft)', fontSize: 9, lineHeight: 1.4 }}>
        {recipe.replaceNotice}
      </div>

      {reviewing && (
        <div aria-label="Team setup loadouts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 7 }}>
          {Object.entries(recipe.agents).map(([agentId, loadout]) => (
            <div key={agentId} style={{ padding: 9, borderRadius: 7, border: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--ink)', fontSize: 10, fontWeight: 800 }}>{loadout.name}</div>
              <div style={{ color: 'var(--ink-faint)', fontSize: 8, margin: '1px 0 5px' }}>{loadout.role}</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: 9, lineHeight: 1.4 }}>
                {[...loadout.attributes, ...loadout.mindsets].map(id => labels[id] || id).join(' · ')}
              </div>
              <div style={{ color: 'var(--ink-faint)', fontSize: 8, lineHeight: 1.35, marginTop: 5 }}>{loadout.rationale}</div>
            </div>
          ))}
        </div>
      )}

      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 10 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
        {reviewing && <button type="button" onClick={() => setReviewing(false)} disabled={applying} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 9, fontWeight: 750 }}>Cancel</button>}
        <button
          type="button"
          disabled={recipe.applied || applying}
          onClick={reviewing ? applyRecipe : () => setReviewing(true)}
          style={{ padding: '7px 11px', borderRadius: 7, border: '1px solid var(--accent)', background: recipe.applied ? 'var(--surface-2)' : 'var(--accent-soft)', color: recipe.applied ? 'var(--ink-faint)' : 'var(--ink)', cursor: recipe.applied ? 'default' : 'pointer', fontSize: 9, fontWeight: 800 }}
        >
          {recipe.applied ? 'Applied to this workspace' : applying ? 'Applying atomically…' : reviewing ? 'Apply to all eight agents' : 'Review all eight loadouts'}
        </button>
      </div>
    </section>
  );
}
