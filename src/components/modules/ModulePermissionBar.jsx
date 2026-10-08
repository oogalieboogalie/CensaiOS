/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { MODULE_PERMISSION_LABELS } from '../../lib/modules/moduleFormat.js';

/** "This module wants to …" with Allow / Don't allow, one permission at a time. */
export function ModulePermissionBar({ permission, onDecide }) {
  if (!permission) return null;
  return (
    <div className="hb-module-ask" role="alertdialog" aria-label="Module permission" data-module-permission={permission}>
      <span className="hb-module-ask-text">
        This module wants to <strong>{(MODULE_PERMISSION_LABELS[permission] || permission).replace(/^./, c => c.toLowerCase())}</strong>.
      </span>
      <button type="button" className="hb-btn" onClick={() => onDecide(permission, false)}>Don&apos;t allow</button>
      <button type="button" className="hb-btn" data-primary="true" onClick={() => onDecide(permission, true)}>Allow</button>
    </div>
  );
}
