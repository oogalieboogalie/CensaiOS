/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { useLegion } from './useLegion.js';
import { LegionSetup } from './LegionSetup.jsx';
import { LegionPhases, LegionTeam } from './LegionTeam.jsx';
import { LegionFeed } from './LegionFeed.jsx';
import { LegionEcho } from './LegionEcho.jsx';
import { LegionQueue } from './LegionQueue.jsx';
import { windowMeta } from './meta.js';

export { windowMeta };

/**
 * Legion, from the diagram ("Not swarms.. Legions."): the Architect plans
 * with Research, Foresight and Echo, four builders work in order
 * (Foundation, Nexus, Atlas, Genesis), a browser takes a screenshot, Echo
 * says OK or NOK, NOK goes round the fix loop, OK commits, and every agent
 * gets a reflection. Any model can fill any role, on the person's own keys.
 * The work runs on the server (server/legion/); this window watches it.
 */
export function LegionWindow({ win = {}, onUpdate }) {
  const legion = useLegion(win, onUpdate);
  const { run, state, runId } = legion;
  const subtitle = run?.goal ? run.goal.slice(0, 80) : 'Agents that work until it is done';

  return (
    <>
      <WindowTitle icon={<Icon.Group size={12} />} label={win.title || windowMeta.label} subtitle={subtitle} />
      <div className="hb-legion">
        {!runId ? (
          <LegionSetup win={win} onUpdate={onUpdate} onStart={legion.start} error={legion.error} onOpen={legion.open} />
        ) : (
          <>
            <header className="hb-legion-head">
              <LegionPhases phase={state.phase} round={state.round} end={state.end} />
              <span className="hb-legion-spacer" />
              {legion.running ? (
                <button type="button" className="hb-btn" onClick={legion.stop}><Icon.Stop size={12} /> Stop</button>
              ) : (
                <button type="button" className="hb-btn" onClick={legion.newRun}><Icon.Plus size={12} /> New Legion</button>
              )}
            </header>
            {legion.error && <p className="hb-legion-error" role="alert">{legion.error}</p>}
            <div className="hb-legion-body">
              <LegionTeam roles={state.roles} models={run?.models} />
              <div className="hb-legion-middle">
                <LegionQueue jobs={state.queue} />
                <LegionFeed state={state} onAnswer={legion.answer} />
              </div>
              <LegionEcho runId={runId} state={state} run={run} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default LegionWindow;
