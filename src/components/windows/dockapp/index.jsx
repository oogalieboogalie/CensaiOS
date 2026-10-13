/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { presenceLine } from '../../../lib/dock/wire.js';
import { windowMeta } from './meta.js';
import { useDockApp } from './useDockApp.js';
import { DockPicker } from './DockPicker.jsx';

export { windowMeta };

function Note({ title, children, action }) {
  return (
    <div className="hb-dock-note" data-testid="dock-note">
      <div className="hb-dock-card">
        {title && <div className="hb-dock-title">{title}</div>}
        {children}
        {action}
      </div>
    </div>
  );
}

/** The browser version: what this window is and where it works. */
function DesktopOnly() {
  return (
    <Note title="Dock a real app here">
      <p className="hb-dock-body">In the censaiOS desktop app on Windows, this window holds a real app from your computer, such as a game client, Discord or a terminal. It moves and resizes with the canvas, and you use it as normal.</p>
      <p className="hb-dock-body">Teammates see a live picture of it, never the app itself.</p>
      <p className="hb-dock-muted">Playing a cloud game? Open GeForce NOW in a Browser window instead; that works today.</p>
    </Note>
  );
}

/** What the person docking sees under their app when it is tucked away. */
function HostSlot({ app, native }) {
  if (native.visible) return null;
  return (
    <div className="hb-dock-under" data-testid="dock-under">
      {native.error && native.error !== 'gone'
        ? <span>{native.error}</span>
        : <span>{app} is docked here. Zoom in or uncover this window to use it.</span>}
    </div>
  );
}

/** Teammates: a picture of the docked app, a few times a second. */
function Cast({ dock, picture, lastPicture, canTakeOver, takeOver }) {
  const line = presenceLine(dock);
  return (
    <div className="hb-dock-cast" data-testid="dock-cast">
      {lastPicture && <img className="hb-dock-cast-img" data-stale={picture ? undefined : 'true'} src={lastPicture.frame} alt={`${dock.app}, shared by ${dock.hostName}`} />}
      {(!picture || canTakeOver) && (
        <div className="hb-dock-bar">
          <span className="hb-dock-dot" aria-hidden="true" />
          <span>{line}</span>
          {!picture && <span className="hb-dock-muted">{dock.cast === false ? 'Picture not shared' : lastPicture ? 'Paused' : 'Waiting for a picture'}</span>}
          {canTakeOver && <button type="button" className="hb-btn" onClick={takeOver}>Use here</button>}
        </div>
      )}
    </div>
  );
}

/**
 * Dock app: reserves a slot on the canvas for a real desktop app. On the
 * Windows desktop app the shell keeps that app's own window over the slot;
 * everyone else on the board sees a live picture of it.
 */
export function DockAppWindow({ win = {}, onUpdate }) {
  const areaRef = React.useRef(null);
  const d = useDockApp({ win, onUpdate, areaRef });
  const { dock } = d;

  const subtitle = d.active ? presenceLine(dock, { self: d.hosting }) : d.desktop ? 'Pick an app' : 'Desktop app';
  const actions = d.hosting ? [
    { id: 'cast', label: null, title: d.casting ? 'Teammates see a picture of it' : 'Picture hidden from teammates', pressed: d.casting,
      icon: d.casting ? <Icon.Eye size={14} /> : <Icon.Stop size={14} />, onSelect: () => d.setCast(!d.casting) },
  ] : undefined;
  const menu = d.hosting ? [
    { id: 'change', label: 'Dock a different app', onSelect: d.changeApp },
    { id: 'undock', label: 'Undock', onSelect: d.undock },
  ] : undefined;

  let body;
  if (d.picker.open) body = <DockPicker {...d.picker} />;
  else if (d.hosting) {
    body = (
      <div ref={areaRef} className="hb-dock-slot" data-testid="dock-slot">
        <HostSlot app={dock.app} native={d.native} />
      </div>
    );
  } else if (d.active) {
    body = <Cast dock={dock} picture={d.picture} lastPicture={d.lastPicture} canTakeOver={d.canTakeOver} takeOver={d.takeOver} />;
  } else {
    body = <DesktopOnly />;
  }

  return (
    <>
      <WindowTitle icon={<Icon.Dock size={14} />} label={win.title || windowMeta.label} subtitle={subtitle} actions={actions} menu={menu} />
      <div className="hb-dock" data-testid="dockapp">{body}</div>
    </>
  );
}
