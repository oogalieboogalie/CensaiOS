/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { buildWaves, STAGE_WORDS, waveSummary } from '../../lib/jules/waves.js';

const WAVE_WORDS = { merged: 'All merged', running: 'Running', 'needs-fix': 'Needs a fix', waiting: 'Up next', locked: 'Locked' };

function WaveTask({ task }) {
  return (
    <li className={`hb-jw-task hb-jw-${task.stage}`} title={task.brief || task.title}>
      <span className="hb-jw-dot" aria-hidden="true" />
      <code className="hb-jw-label">{task.label}</code>
      <span className="hb-jw-title">{task.title || task.brief}</span>
      <span className="hb-jw-stage">
        {STAGE_WORDS[task.stage]}
        {task.prNumber ? ` · PR #${task.prNumber}` : ''}
      </span>
    </li>
  );
}

/**
 * Wave-by-wave Jules runs (Alex's diagram 01): each wave's tasks go to
 * Jules, open PRs and get reviewed; a turned-down PR is fixed first. The
 * next wave stays locked until every PR in the current one is merged.
 */
export function JulesWavesPanel({ queue }) {
  const { waves, current } = React.useMemo(() => buildWaves(queue || {}), [queue]);
  if (!queue) return null;
  return (
    <section className="hb-jw" aria-label="Waves" data-testid="jules-waves">
      <header className="hb-jw-head">
        <span className="hb-jw-heading">Waves</span>
        <span className="hb-jw-note">
          {current ? `Wave ${current} is going. The next wave starts when every PR in it is merged.` : waves.length ? 'Every wave is merged.' : 'No waves yet. Put "Wave: 1" in a task\'s brief to group it; wave 2 waits for wave 1.'}
        </span>
      </header>
      {waves.length > 0 && (
        <div className="hb-jw-row">
          {waves.map((wave) => (
            <article key={wave.number} className={`hb-jw-wave hb-jw-wave-${wave.state}`} data-testid="jules-wave">
              <div className="hb-jw-wave-head">
                <strong>Wave {wave.number}</strong>
                <span className="hb-jw-badge">{WAVE_WORDS[wave.state]}</span>
              </div>
              <ul className="hb-jw-tasks">
                {wave.tasks.map((task) => <WaveTask key={task.label} task={task} />)}
              </ul>
              <p className="hb-jw-summary">{waveSummary(wave)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
