import React, { useState } from 'react';
import { DIcon } from './dockerIcons.jsx';
import { dockerApi } from './dockerApi.js';
import './dockerRun.css';

// A starting name from the image: "axllent/mailpit:latest" -> "mailpit".
export function suggestName(repository) {
  return String(repository || '').split('/').pop().replace(/[^A-Za-z0-9_.-]/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 40);
}

// When Docker starts the container again by itself.
export const RESTART_CHOICES = [
  ['no', "Don't start it again"],
  ['on-failure', 'If it crashes'],
  ['unless-stopped', 'If it stops, unless I stopped it'],
  ['always', 'Always'],
];

/**
 * Opened from an image's Run button: name and ports, and under More
 * settings the container's settings (NAME=value lines), one folder shared
 * from this computer and when to start it again. Then docker run -d.
 */
export function RunImageForm({ image, run, busy, onCancel, onStarted }) {
  const [name, setName] = useState(() => suggestName(image.repository));
  const [ports, setPorts] = useState('');
  const [more, setMore] = useState(false);
  const [env, setEnv] = useState('');
  const [share, setShare] = useState({ host: '', target: '' });
  const [restart, setRestart] = useState('no');
  const key = `run:${image.ref}`;
  const submit = async (e) => {
    e.preventDefault();
    const result = await run(key, () => dockerApi.runImage({ image: image.ref, name: name.trim(), ports, env, share, restart }),
      (r) => `Started ${r.name || image.ref}${r.ports.length ? ` on port ${r.ports.map((p) => p.split(':')[0]).join(', ')}` : ''}`);
    if (result) onStarted?.(result);
  };
  return (
    <form className="dk-run" onSubmit={submit} aria-label={`Run ${image.ref}`}>
      <div className="dk-run-title"><DIcon.Play size={12} /> Start a new container from <span className="dk-mono">{image.ref}</span></div>
      <label className="dk-run-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Docker picks one" aria-label="Container name" disabled={busy[key]} autoFocus />
      </label>
      <label className="dk-run-field">
        <span>Ports</span>
        <input value={ports} onChange={(e) => setPorts(e.target.value)} placeholder="8080:80 (this computer:container)" aria-label="Ports" disabled={busy[key]} />
      </label>
      <button type="button" className="dk-run-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
        {more ? 'Fewer settings' : 'More settings'}
      </button>
      {more && (
        <div className="dk-run-extra">
          <label className="dk-run-field dk-run-field--wide">
            <span>Settings, one NAME=value per line</span>
            <textarea value={env} onChange={(e) => setEnv(e.target.value)} rows={3} spellCheck={false}
              placeholder={'POSTGRES_USER=sam\nPOSTGRES_DB=notes'} aria-label="Settings" disabled={busy[key]} />
          </label>
          <label className="dk-run-field">
            <span>Folder on this computer</span>
            <input value={share.host} onChange={(e) => setShare((s) => ({ ...s, host: e.target.value }))} placeholder={'D:\\data\\notes'} aria-label="Folder on this computer" disabled={busy[key]} />
          </label>
          <label className="dk-run-field">
            <span>Shows up inside the container at</span>
            <input value={share.target} onChange={(e) => setShare((s) => ({ ...s, target: e.target.value }))} placeholder="/data" aria-label="Path inside the container" disabled={busy[key]} />
          </label>
          <label className="dk-run-field">
            <span>Start it again</span>
            <select value={restart} onChange={(e) => setRestart(e.target.value)} aria-label="Start it again" disabled={busy[key]}>
              {RESTART_CHOICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className="dk-run-buttons">
        <button type="button" className="dk-btn" onClick={onCancel} disabled={busy[key]}>Cancel</button>
        <button type="submit" className="dk-btn dk-btn--primary" disabled={busy[key]}>
          {busy[key] ? <><span className="dk-spinner" /> Starting…</> : 'Run'}
        </button>
      </div>
    </form>
  );
}
