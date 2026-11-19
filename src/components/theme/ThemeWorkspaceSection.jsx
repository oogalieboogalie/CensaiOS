import React from 'react';
import { MovingAroundSection, WindowsAndGroupsSection } from './CanvasInteractionSettings.jsx';
import { WorkspaceAccountActions } from './WorkspaceAccountActions.jsx';
import { AdBlockCard } from './AdBlockCard.jsx';
import { UpdateSection } from './UpdateSection.jsx';

/** Settings > Canvas. Border thickness and text size moved to Appearance, Windows. */
export function WorkspaceSection({ focusMode, setFocusMode, penMode, setPenMode, onResetWorkspace, onLogout, accountNote }) {
  return (
    <>
      <MovingAroundSection focusMode={focusMode} setFocusMode={setFocusMode} penMode={penMode} setPenMode={setPenMode} />
      <WindowsAndGroupsSection />
      <AdBlockCard />
      <UpdateSection />
      <WorkspaceAccountActions onResetWorkspace={onResetWorkspace} onLogout={onLogout} note={accountNote} />
    </>
  );
}
