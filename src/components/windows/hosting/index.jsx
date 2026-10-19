/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { BrandIcon } from '../../brand/BrandIcon.jsx';
import { useWorkspaceStore } from '../../../lib/store.js';
import { HOST_TARGETS, KIND_WORDS, hostTarget } from '../../../lib/hosting/hostTargets.js';
import { SECRET_NAMES, hostRecipe, makeSecret } from '../../../lib/hosting/hostRecipes.js';
import { HostFile } from './HostFile.jsx';
import { DeployButton } from './DeployButton.jsx';
import { windowMeta } from './meta.js';

export { windowMeta };

const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

/**
 * Places to Host, from Alex's diagram 18. One row of places censaiOS can
 * live. Docker and Kubernetes open their windows; Railway, Render and
 * Google Cloud Run get the file that service reads, with fresh secrets
 * already filled in; Supabase holds the database; Jupyter runs beside it.
 */
export function HostingWindow({ win = {} }) {
  const [picked, setPicked] = React.useState(win.target || 'railway');
  const [secrets] = React.useState(() => Object.fromEntries(SECRET_NAMES.map((name) => [name, makeSecret(randomBytes)])));
  const target = hostTarget(picked);
  const recipe = hostRecipe(target.id, { secrets });
  const [repo, setRepo] = React.useState(() => {
    const { wins = [], currentProject } = useWorkspaceStore.getState();
    const gh = wins.find((w) => w.kind === 'githubConsole' && (w.state?.repo || w.prDesk?.repo));
    return win.deployRepo || gh?.state?.repo || gh?.prDesk?.repo || currentProject?.repo || '';
  });
  const open = () => useWorkspaceStore.getState().spawnAt(target.opens, {});

  return (
    <>
      <WindowTitle icon={<Icon.Server size={12} />} label={win.title || windowMeta.label} subtitle={`${HOST_TARGETS.length} places censaiOS can live`} />
      <div className="hb-host">
        <nav className="hb-host-row" aria-label="Places to host">
          {HOST_TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`hb-host-tile${t.id === target.id ? ' is-on' : ''}`}
              aria-pressed={t.id === target.id}
              onClick={() => setPicked(t.id)}
              data-testid={`host-${t.id}`}
            >
              <BrandIcon brand={t.brand} size={26} tone="color" title="" />
              <span className="hb-host-tile-name">{t.name}</span>
              <span className={`hb-host-kind hb-host-kind-${t.kind}`}>{KIND_WORDS[t.kind]}</span>
            </button>
          ))}
        </nav>
        <section className="hb-host-detail" aria-label={target.name}>
          <header className="hb-host-detail-head">
            <BrandIcon brand={target.brand} size={32} tone="color" title="" />
            <div>
              <h3 className="hb-host-title">{target.name}</h3>
              <p className="hb-host-where">{target.where}</p>
            </div>
          </header>
          <p className="hb-host-blurb">{target.blurb}</p>
          {target.opens && (
            <button type="button" className="hb-host-btn hb-host-btn-primary" onClick={open}>
              Open the {target.name} window
            </button>
          )}
          {recipe && (
            <>
              <ol className="hb-host-steps">
                {recipe.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <DeployButton targetId={target.id} repo={repo} onRepo={setRepo} />
              {recipe.files.map((file) => <HostFile key={file.name} file={file} />)}
            </>
          )}
        </section>
      </div>
    </>
  );
}
