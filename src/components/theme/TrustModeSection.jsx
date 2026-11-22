import React from 'react';
import { useTrustMode } from '../approvals/useTrustMode.js';
import { FAMILY_AGENTS } from '../../data/family-agents.js';
import { OWNER_ONLY, SettingsGroup, SettingsNote, SettingsRow, SettingsRows, SettingsSection, SwitchRow, useSavedNote } from './settingsKit.jsx';

function choiceFor(value) {
  if (value === true) return 'trust';
  if (value === false) return 'ask';
  return 'board';
}

/** Settings > Agents: the board's Trust mode, plus a choice for each agent. */
export function TrustModeSection() {
  const trust = useTrustMode();
  const disabled = !trust.ready || !trust.canChange || trust.saving;
  const note = useSavedNote(trust.saving, trust.error);
  const change = (agentId, choice) => trust.setAgent(agentId, choice === 'board' ? null : choice === 'trust');
  return (
    <SettingsSection
      title="Trust mode"
      hint="Never automatic, whatever you pick: messages or emails to another person, spending money, and signing. Agents never sign."
      data-testid="trust-mode-section"
    >
      <SwitchRow
        label="Agents act without asking"
        hint={trust.board
          ? 'On. Edits to files, the board, designs, PDFs and CAD parts happen without your OK. So do commands, database changes and restarts, when you are this computer\'s owner.'
          : 'Off. Each change waits in Action Approvals until an owner or admin says OK.'}
        switchLabel="Trust mode"
        checked={trust.board}
        disabled={disabled}
        onChange={(on) => trust.setBoard(on)}
        data-testid="trust-mode-switch"
      />
      <SettingsGroup title="One agent at a time" hint="Leave an agent on “Same as the board”, or choose for that agent only.">
        <SettingsRows>
          {FAMILY_AGENTS.map((agent) => (
            <SettingsRow key={agent.id} label={agent.name}>
              <select className="hb-set-input" disabled={disabled} aria-label={`Trust mode for ${agent.name}`}
                value={choiceFor(trust.agents[agent.id])} onChange={(event) => change(agent.id, event.target.value)}>
                <option value="board">Same as the board</option>
                <option value="trust">Acts on its own</option>
                <option value="ask">Asks first</option>
              </select>
            </SettingsRow>
          ))}
        </SettingsRows>
      </SettingsGroup>
      <p className="hb-set-hint" data-testid="trust-mode-files">
        Every family agent has the tools for its role with nothing to equip: Nexus and Atlas the database, Foundation
        Docker and mail, the builders commands, and everyone the web, GitHub, your calendar and sheets. To let agents open
        files, open a project from the top bar (only that project&apos;s files open). Commands, the database, Docker and
        saving files work only for this computer&apos;s owner.
      </p>
      {trust.ready && !trust.canChange ? <SettingsNote>{OWNER_ONLY}</SettingsNote> : null}
      <SettingsNote note={note} />
    </SettingsSection>
  );
}
