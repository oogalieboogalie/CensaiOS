import React from 'react';
import { api } from '../../lib/api.js';
import { MODEL_OPTIONS } from '../../lib/agentModelOptions.js';

const EVERY = [[1, 'hour'], [3, '3 hours'], [6, '6 hours'], [12, '12 hours'], [24, 'day'], [72, '3 days'], [168, 'week']];
const PROVIDERS = ['openrouter', 'anthropic', 'openai', 'google', 'xai', 'cohere', 'ollama'];

function when(value) {
  return value ? new Date(value).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

// Idea Foundry: switch it on and it grows one new skill set at a time, on its
// own, with the person's own model key. No prompt to write.
export function IdeaFoundryCard({ workspaceId, onGrew }) {
  const [settings, setSettings] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const r = await api.getIdeaFoundry(workspaceId);
      setSettings(r.settings);
      setForm({ ...r.settings, model: r.settings.modelName ? `${r.settings.modelProvider || ''}::${r.settings.modelName}` : '', professionText: (r.settings.professions || []).join('\n') });
    } catch (err) { setError(err.message); }
  }, [workspaceId]);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    if (!settings?.enabled) return undefined;
    const timer = setInterval(async () => {
      const r = await api.getIdeaFoundry(workspaceId).catch(() => null);
      if (r && r.settings.lastResult !== settings.lastResult) { setSettings(r.settings); onGrew?.(); }
    }, 30000);
    return () => clearInterval(timer);
  }, [settings, workspaceId, onGrew]);

  if (!form) return null;
  const save = async (patch = {}) => {
    const next = { ...form, ...patch };
    const [modelProvider, modelName] = next.model ? next.model.split('::') : [null, null];
    setForm(next);
    setSaving(true);
    setError('');
    try {
      const r = await api.saveIdeaFoundry(workspaceId, {
        enabled: next.enabled, intervalHours: Number(next.intervalHours), modelProvider: modelProvider || null, modelName: modelName || null,
        professions: next.professionText.split('\n'),
      });
      setSettings(r.settings);
      setForm({ ...next, enabled: r.settings.enabled });
    } catch (err) { setError(err.message); setForm(form); } finally { setSaving(false); }
  };

  return (
    <section className="hb-sk-card" data-testid="idea-foundry">
      <div className="hb-sk-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3 className="hb-sk-h">Idea Foundry</h3>
          <p className="hb-sk-sub">Grows a new skill set on its own, then you fine-tune it.</p>
        </div>
        <label className="hb-sk-toggle">
          <input type="checkbox" data-testid="idea-foundry-on" checked={Boolean(form.enabled)} disabled={saving} onChange={(e) => save({ enabled: e.target.checked })} />
          {form.enabled ? 'On' : 'Off'}
        </label>
      </div>
      <label className="hb-sk-row hb-sk-sub">Every
        <select className="hb-sk-select" value={form.intervalHours} onChange={(e) => setForm({ ...form, intervalHours: e.target.value })}>
          {EVERY.map(([hours, label]) => <option key={hours} value={hours}>{label}</option>)}
        </select>
      </label>
      <label className="hb-sk-row hb-sk-sub">Model
        <select className="hb-sk-select" style={{ flex: 1 }} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
          <option value="">Your usual chat model</option>
          {PROVIDERS.filter((p) => MODEL_OPTIONS[p]).map((p) => (
            <optgroup key={p} label={p}>{MODEL_OPTIONS[p].map((o) => <option key={o.value} value={`${p}::${o.value}`}>{o.label}</option>)}</optgroup>
          ))}
        </select>
      </label>
      <textarea className="hb-sk-text" rows={3} aria-label="Professions" value={form.professionText} placeholder="Professions, one per line. Leave empty and it picks for you." onChange={(e) => setForm({ ...form, professionText: e.target.value })} />
      <div className="hb-sk-row">
        <button type="button" className="hb-sk-btn" disabled={saving} onClick={() => save()}>{saving ? 'Saving' : 'Save'}</button>
        {settings?.enabled && settings.nextRunAt && <span className="hb-sk-item-meta">Next one {when(settings.nextRunAt)}</span>}
      </div>
      {settings?.lastResult && <span className="hb-sk-item-meta">Last made: {settings.lastResult}</span>}
      {(error || settings?.lastError) && <div className="hb-sk-error" role="alert">{error || `Last try didn't work: ${settings.lastError}`}</div>}
    </section>
  );
}
