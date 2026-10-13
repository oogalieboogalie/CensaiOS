/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { getModuleGrants, pendingPermissions, setModuleGrant } from '../../lib/modules/moduleGrants.js';
import { normalizeManifest } from '../../lib/modules/moduleFormat.js';
import { describePermissions } from '../../lib/modules/manifestV3.js';
import { isFinished, toolLabel } from '../../lib/modules/moduleAgentCalls.js';
import { ModuleFrame } from './ModuleFrame.jsx';
import { ModulePermissionBar } from './ModulePermissionBar.jsx';
import { useModuleAgentCalls } from './useModuleAgentCalls.js';

const REFUSED_SHOW_MS = 7000;
const AGENT_LINE_LINGER_MS = 5000;

function refusedText({ permission, target }) {
  if (permission === 'network') {
    let host = '';
    try { host = target ? new URL(target).host : ''; } catch { host = ''; }
    return `Blocked: it tried to reach ${host || 'the internet'}, which its manifest does not allow.`;
  }
  if (permission === 'agent') return 'Blocked: it tried to ask an agent without permission.';
  if (permission === 'storage') return 'Blocked: it tried to save data, which its manifest does not allow.';
  if (permission === 'forms') return 'Blocked: it tried to send a form off the board.';
  return 'Blocked: it tried to load outside code, which the sandbox does not allow.';
}

/** "Atlas is using this module: add listing", while an agent drives it. */
function AgentCallLine({ call }) {
  const [, tick] = React.useState(0);
  const finished = isFinished(call);
  const doneAt = call?.doneAt ? Date.parse(call.doneAt) : 0;
  const lingering = finished && doneAt && Date.now() - doneAt < AGENT_LINE_LINGER_MS;
  React.useEffect(() => {
    if (!lingering) return undefined;
    const timer = setTimeout(() => tick(n => n + 1), AGENT_LINE_LINGER_MS - (Date.now() - doneAt) + 50);
    return () => clearTimeout(timer);
  }, [lingering, doneAt]);
  if (!call?.id || (finished && !lingering)) return null;
  const label = toolLabel(call.tool);
  const text = call.status === 'error' ? `${call.by} could not ${label}: ${call.error}`
    : call.status === 'expired' ? `${call.by} tried to ${label}, but no board picked it up.`
      : finished ? `${call.by} used this module: ${label}`
        : `${call.by} is using this module: ${label}`;
  return (
    <div className="hb-module-agent" role="status" data-module-agent-call={call.status}>
      <span className="hb-module-agent-dot" aria-hidden="true" data-state={call.status} />
      <span>{text}</span>
    </div>
  );
}

/**
 * A finished module running on the canvas: the permission bar, the sandbox,
 * the click shield, script errors, refusals, toasts, and agents pressing its
 * tools. Shared by on-demand module windows and modules promoted to built-in
 * windows, so both behave the same. The manifest is read as v3 (an older one
 * upgrades here), and the module gets only what that manifest declares.
 */
export function ModuleRuntime({ win, onUpdate, workspaceId, tokens, isActive = true, title, frameAllow, children }) {
  const manifest = React.useMemo(() => normalizeManifest(win.manifest, { request: win.request }), [win.manifest, win.request]);
  const [grants, setGrants] = React.useState(() => getModuleGrants(win.id));
  const [asking, setAsking] = React.useState(null); // permission waiting on the person
  const [toasts, setToasts] = React.useState([]);
  const [refused, setRefused] = React.useState([]);
  const [scriptError, setScriptError] = React.useState(null);
  const bridgeRef = React.useRef(null);
  const agentCall = useModuleAgentCalls({ win, onUpdate, bridgeRef });

  React.useEffect(() => { setScriptError(null); }, [win.source]);

  const pendingAsk = React.useRef(null);
  const decide = React.useCallback((permission, allow) => {
    setGrants(setModuleGrant(win.id, permission, allow));
    if (pendingAsk.current?.permission === permission) {
      pendingAsk.current.resolve(allow);
      pendingAsk.current = null;
    }
    setAsking(null);
  }, [win.id]);

  const requestPermission = React.useCallback((permission) => new Promise((resolve) => {
    pendingAsk.current?.resolve(false);
    pendingAsk.current = { permission, resolve };
    setAsking(permission);
  }), []);

  // Network is part of the sandbox's CSP, so it is asked up front.
  const upfront = pendingPermissions(manifest, grants).filter(p => p === 'network');
  const askingFor = asking || upfront[0] || null;

  const onToast = React.useCallback((message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(list => [...list.slice(-2), { id, message }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 2600);
  }, []);

  const onRefused = React.useCallback((what) => {
    const text = refusedText(what);
    setRefused((list) => {
      if (list.some(r => r.text === text)) return list;
      const id = Math.random().toString(36).slice(2);
      setTimeout(() => setRefused(l => l.filter(r => r.id !== id)), REFUSED_SHOW_MS);
      return [...list.slice(-1), { id, text, permission: what.permission }];
    });
  }, []);

  const networkLine = describePermissions(manifest).find(line => /^(Reach|Use any)/.test(line));

  return (
    <>
      <ModulePermissionBar permission={askingFor} detail={askingFor === 'network' ? networkLine : null} onDecide={decide} />
      {children}
      <AgentCallLine call={agentCall} />
      <ModuleFrame
        win={win}
        manifest={manifest}
        onUpdate={onUpdate}
        workspaceId={workspaceId}
        tokens={tokens}
        grants={grants}
        requestPermission={requestPermission}
        onToast={onToast}
        onScriptError={setScriptError}
        onRefused={onRefused}
        bridgeRef={bridgeRef}
        title={title}
        frameAllow={frameAllow}
      />
      {/* Unselected, the iframe would swallow the click that selects the window. */}
      {!isActive && <div className="hb-module-shield" data-module-shield aria-hidden="true" />}
      {refused.length > 0 && (
        <div className="hb-module-refused" role="status" data-module-refused={refused.at(-1).permission}>
          {refused.map(r => <div key={r.id}>{r.text}</div>)}
        </div>
      )}
      {scriptError && <div className="hb-module-script-error" role="status">Script error: {scriptError}</div>}
      <div className="hb-module-toasts" aria-live="polite">
        {toasts.map(t => <div key={t.id} className="hb-module-toast" data-module-toast>{t.message}</div>)}
      </div>
    </>
  );
}
