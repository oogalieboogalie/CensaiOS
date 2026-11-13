/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { buildWaves, STAGE_WORDS, waveSummary } from '../../lib/jules/waves.js';

const WAVE_WORDS = { merged: 'All merged', running: 'Running', 'needs-fix': 'Needs a fix', waiting: 'Up next', locked: 'Locked' };

function WaveTask({ task }) {
  return (
    <li className="jules-wave-task" data-stage={task.stage} title={task.brief || task.title}>
      <span className="jules-dot" aria-hidden="true" />
      <code className="jules-wave-label">{task.label}</code>
      <span className="jules-wave-title">{task.title || task.brief}</span>
      <span className="jules-wave-stage">
        {STAGE_WORDS[task.stage]}
        {task.prNumber ? ` · PR #${task.prNumber}` : ''}
      </span>
    </li>
  );
}

/**
 * Wave-by-wave Jules runs (diagram 01): each wave's tasks go to
 * Jules, open PRs and get reviewed; a turned-down PR is fixed first. The
 * next wave stays locked until every PR in the current one is merged.
 */
export function JulesWavesPanel({ queue }) {
  const { waves, current } = React.useMemo(() => buildWaves(queue || {}), [queue]);
  if (!queue) return null;
  return (
    <section className="jules-section" aria-label="Waves" data-testid="jules-waves">
      <header className="jules-head">
        <span className="jules-title">Waves</span>
        <span className="jules-note">
          {current ? `Wave ${current} is going. The next wave starts when every PR in it is merged.` : waves.length ? 'Every wave is merged.' : 'No waves yet. Put "Wave: 1" in a task\'s brief to group it; wave 2 waits for wave 1.'}
        </span>
      </header>
      {waves.length > 0 && (
        <div className="hb-well jules-wave-row">
          {waves.map((wave) => (
            <article key={wave.number} className="hb-panel jules-wave" data-state={wave.state} data-testid="jules-wave">
              <div className="jules-wave-head">
                <strong className="jules-wave-name">Wave {wave.number}</strong>
                <span className="jules-pill">{WAVE_WORDS[wave.state]}</span>
              </div>
              <ul className="jules-wave-tasks">
                {wave.tasks.map((task) => <WaveTask key={task.label} task={task} />)}
              </ul>
              <p className="jules-wave-summary">{waveSummary(wave)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
