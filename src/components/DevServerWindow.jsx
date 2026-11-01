import React, { useCallback, useEffect, useState } from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { DIcon } from './docker/dockerIcons.jsx';
import { IconButton, StatusDot, UnavailableState, EmptyState } from './docker/DockerUi.jsx';
import { LogsView } from './docker/LogsView.jsx';
import { useDevServer } from './devServer/useDevServer.js';
import { PHASE_COPY, folderName } from './devServer/devServerApi.js';
import './docker/docker.css';
import { autoStartIsMine } from '../lib/chat/agentPointer.js';
import { useComputerOwnerAnswer } from './docker/useComputerOwner.js';

/**
 * Run dev: pick a project folder, press one button, and its dev server runs
 * in a throwaway Docker container. When the site answers it opens in a
 * Browser window on the canvas; the log streams here. Stop (or closing the
 * window) removes the container.
 */
export function DevServerWindow({ win, onUpdate, onSpawn, currentProject }) {
  const [folder, setFolder] = useState(win.folder || currentProject?.path || '');
  const [command, setCommand] = useState(win.command || '');
  const [port, setPort] = useState(win.port || '');
  const [image, setImage] = useState(win.image || '');
  // The window's project menu (header) can move it to another folder.
  useEffect(() => { if (win.folder) setFolder(win.folder); }, [win.folder]);
  const setName = useCallback((devName) => onUpdate({ devName }), [onUpdate]);
  // Starting and stopping is the computer owner's (the server refuses anyone
  // else); a teammate watches the same window and reads one plain sentence.
  const owner = useComputerOwnerAnswer();
  const dev = useDevServer({ name: win.devName || null, onName: setName, canChange: owner === true });
  const { engine, status } = dev;
  const phase = status?.phase || (win.devName ? 'preparing' : null);
  const copy = phase ? PHASE_COPY[phase] : null;
  const live = Boolean(win.devName) && phase !== 'stopped';
  // Only this run's address: a stale status must never open another Browser.
  const url = phase === 'ready' && win.devName && status?.name === win.devName ? status.url : null;

  const run = useCallback(() => {
    if (!folder.trim()) { dev.setError('Type the project folder first, like D:\\Projects\\my-site.'); return; }
    onUpdate({ folder: folder.trim(), command, port, image });
    dev.start({ folder: folder.trim(), command, port: port || undefined, image: image || undefined });
  }, [folder, command, port, image, onUpdate, dev]);

  // Opened from Project files (or by an agent for this person): start straight away.
  useEffect(() => {
    if (owner === true && win.autoStart && autoStartIsMine(win) && engine.checked && !engine.error && !win.devName && folder.trim()) {
      onUpdate({ autoStart: false });
      run();
    }
  }, [owner, win.autoStart, engine.checked, engine.error, win.devName, folder, onUpdate, run]);

  // The first time this run answers, show the site in a Browser window.
  const openBrowser = useCallback(() => {
    if (url) onSpawn?.('browser', { url, title: folderName(win.folder) || 'Dev server' });
  }, [url, onSpawn, win.folder]);
  useEffect(() => {
    const key = url && `${win.devName}@${url}`;
    if (key && win.openedFor !== key) {
      onUpdate({ openedFor: key });
      openBrowser();
    }
  }, [url, win.devName, win.openedFor, onUpdate, openBrowser]);

  const title = folderName(win.folder || folder);
  const ownerOnly = <p className="rd-note" data-testid="run-dev-owner-only">Only this computer&apos;s owner can start or stop Run dev. You can watch it here.</p>;
  const showLogs = win.devName && ['installing', 'ready', 'exited'].includes(phase);

  return (
    <>
      <WindowTitle icon={<DIcon.Play size={13} />} label="Run dev" subtitle={title || 'pick a project'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter((a) => a !== id) })} />
      <div className="dk-root rd-root" data-testid="run-dev">
        {engine.checked && engine.error ? (
          <>
            <UnavailableState reason={engine.reason} message={engine.error} onRetry={dev.checkEngine} />
            <p className="rd-note">
              {['runner-unreachable', 'runner-disabled'].includes(engine.reason)
                ? 'censaiOS is not allowed to use Docker on this computer yet. That needs a one-time Docker setup change on the PC; once it is made, Run dev works here with no other steps.'
                : 'Run dev needs Docker Desktop running on this computer. The laptop install has no Docker, so use Run dev on the PC.'}
            </p>
            {owner === false && ownerOnly}
          </>
        ) : (
          <>
            <form className="rd-setup" onSubmit={(e) => { e.preventDefault(); if (!live) run(); }}>
              <label className="rd-field rd-field--wide">
                <span>Project folder</span>
                <input value={folder} onChange={(e) => setFolder(e.target.value)} disabled={live} spellCheck={false}
                  placeholder="D:\Projects\my-site" aria-label="Project folder" onPointerDown={(e) => e.stopPropagation()} />
              </label>
              <label className="rd-field rd-field--wide">
                <span>Command</span>
                <input value={command} onChange={(e) => setCommand(e.target.value)} disabled={live} spellCheck={false}
                  placeholder="Found in package.json (dev, start or serve)" aria-label="Command" onPointerDown={(e) => e.stopPropagation()} />
              </label>
              <details className="rd-more">
                <summary>More settings</summary>
                <div className="rd-more-grid">
                  <label className="rd-field">
                    <span>Port inside the container</span>
                    <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} disabled={live} inputMode="numeric"
                      placeholder={String(engine.defaults?.port || 3000)} aria-label="Port inside the container" />
                  </label>
                  <label className="rd-field">
                    <span>Node image</span>
                    <input value={image} onChange={(e) => setImage(e.target.value)} disabled={live} spellCheck={false}
                      placeholder={engine.defaults?.image || 'node:22-bookworm-slim'} aria-label="Node image" />
                  </label>
                </div>
              </details>
              <div className="rd-actions">
                {owner === false ? ownerOnly : owner === null ? null : live ? (
                  <IconButton icon={<DIcon.Stop size={12} />} label="Stop and remove the container" tone="danger" className="dk-btn--quiet" onClick={dev.stop} busy={dev.busy}>Stop</IconButton>
                ) : (
                  <button type="submit" className="dk-btn dk-btn--primary rd-run" disabled={dev.busy || !engine.checked}>
                    {dev.busy ? <span className="dk-spinner" aria-hidden="true" /> : <DIcon.Play size={12} />}<span>Run dev</span>
                  </button>
                )}
              </div>
            </form>

            {(copy || dev.error) && (
              <div className={`rd-status rd-status--${dev.error ? 'danger' : copy.tone}`} role="status">
                <StatusDot tone={dev.error ? 'danger' : copy.tone} pulse={dev.starting} />
                <span className="rd-status-text">
                  {dev.error || (url ? <>Running at <code>{url}</code></> : status?.message || copy.text)}
                </span>
                {url && <IconButton icon={<DIcon.External size={12} />} label="Open the site in a Browser window" onClick={openBrowser}>Open in Browser</IconButton>}
              </div>
            )}

            {showLogs ? (
              <LogsView key={win.devName} container={{ id: win.devName, name: win.devName, state: phase === 'exited' ? 'exited' : 'running' }} />
            ) : (
              <EmptyState icon={<DIcon.Play size={26} />} title={win.devName ? (copy?.text || 'Getting ready') : 'Run a project and see it on the canvas'}>
                <p>{win.devName
                  ? 'The dev server log shows here as soon as the container starts.'
                  : 'Press Run dev. The project runs in its own throwaway Docker container, the site opens in a Browser window, and Stop removes the container.'}</p>
              </EmptyState>
            )}
          </>
        )}
      </div>
    </>
  );
}
