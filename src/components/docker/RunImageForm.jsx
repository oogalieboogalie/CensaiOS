import React, { useState } from 'react';
import { DIcon } from './dockerIcons.jsx';
import { dockerApi } from './dockerApi.js';
import './dockerRun.css';

// A starting name from the image: "axllent/mailpit:latest" -> "mailpit".
export function suggestName(repository) {
  return String(repository || '').split('/').pop().replace(/[^A-Za-z0-9_.-]/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 40);
}

/** Opened from an image's Run button: name and ports, then docker run -d. */
export function RunImageForm({ image, run, busy, onCancel, onStarted }) {
  const [name, setName] = useState(() => suggestName(image.repository));
  const [ports, setPorts] = useState('');
  const key = `run:${image.ref}`;
  const submit = async (e) => {
    e.preventDefault();
    const result = await run(key, () => dockerApi.runImage({ image: image.ref, name: name.trim(), ports }),
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
      <div className="dk-run-buttons">
        <button type="button" className="dk-btn" onClick={onCancel} disabled={busy[key]}>Cancel</button>
        <button type="submit" className="dk-btn dk-btn--primary" disabled={busy[key]}>
          {busy[key] ? <><span className="dk-spinner" /> Starting…</> : 'Run'}
        </button>
      </div>
    </form>
  );
}
