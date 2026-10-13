/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../windows/WindowTitle.jsx';
import { Icon } from '../Icons.jsx';
import { WindowChromeContext } from '../windows/windowChromeContext.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { downloadModuleFile } from '../../lib/modules/moduleExport.js';
import { useThemeTokens } from './useModuleBridge.js';
import { ModuleRuntime } from './ModuleRuntime.jsx';
import { getSelf } from '../../lib/modules/presenceRoster.js';

/**
 * A module promoted to a built-in window (spec 6). Its code ships in the
 * app's own folder now, but it still runs in the module sandbox with the
 * same SDK, and its data lives on the window record like any module.
 */
export function PromotedModuleWindow({ win, onUpdate, workspaceId, meta, manifest, source, className = '', frameAllow }) {
  const chrome = React.useContext(WindowChromeContext);
  const activeWorkspaceId = useWorkspaceStore(state => state.workspaceId);
  const tokens = useThemeTokens();
  const label = meta?.label || manifest?.name || 'Module';
  const IconGlyph = Icon[manifest?.icon] || Icon.Toolbox;
  // The runtime reads code and manifest from the window record; promoted
  // windows keep theirs in the folder, so only the data comes from `win`.
  const moduleWin = React.useMemo(() => ({ ...win, status: 'ready', manifest, source }), [win, manifest, source]);

  // Put the module's label on the board record, so agents on the server can
  // read it and press its tools (chat to module). The code stays in the folder.
  const advertised = React.useRef(false);
  React.useEffect(() => {
    if (advertised.current || !manifest || getSelf().canEdit === false) return;
    if (JSON.stringify(win.manifest || null) === JSON.stringify(manifest)) return;
    advertised.current = true;
    onUpdate?.({ manifest });
  }, [win.manifest, manifest, onUpdate]);

  return (
    <>
      <WindowTitle
        icon={<IconGlyph size={14} />}
        label={label}
        menu={[
          { id: 'export', label: 'Export as file', icon: <Icon.Files size={13} />, onSelect: () => downloadModuleFile({ request: '', manifest, source, title: label }, tokens) },
        ]}
      />
      <div className={`hb-module ${className}`.trim()} data-module-window data-module-promoted={meta?.kind || ''} data-module-status="ready">
        <div className="hb-module-stage">
          <ModuleRuntime
            win={moduleWin}
            onUpdate={onUpdate}
            workspaceId={workspaceId ?? activeWorkspaceId}
            tokens={tokens}
            isActive={chrome?.isActive ?? true}
            title={label}
            frameAllow={frameAllow}
          />
        </div>
      </div>
    </>
  );
}
