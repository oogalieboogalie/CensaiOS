// The modules the test team knows how to try. The scheduled run takes one a
// night, in this order, so every module gets its turn; add a new module here
// and it joins the rotation.

import music from './music.mjs';
import docker from './docker.mjs';
import teamChat from './teamChat.mjs';
import framedPages from './framedPages.mjs';
import windowGroups from './windowGroups.mjs';
import leadHound from './leadHound.mjs';
import figma from './figma.mjs';
import agentRegistry from './agentRegistry.mjs';
import chatCapabilities from './chatCapabilities.mjs';
import liveBoard from './liveBoard.mjs';
import sketchpad from './sketchpad.mjs';
import sheets from './sheets.mjs';
import marketplace from './marketplace.mjs';
import scheduler from './scheduler.mjs';
import sharedLink from './sharedLink.mjs';
import terminal from './terminal.mjs';
import doc from './doc.mjs';
import messageRouter from './messageRouter.mjs';

export const MODULES = [music, docker, teamChat, framedPages, windowGroups, leadHound, figma, agentRegistry, chatCapabilities, liveBoard, sketchpad, sheets, marketplace, scheduler, sharedLink, terminal, doc, messageRouter];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which modules this run tries: "next" (one, by the date), "all", or names
 * separated by commas or spaces. Unknown names throw, listing the known ones.
 */
export function pickModules(asked = 'next', date = new Date(), modules = MODULES) {
  const wanted = String(asked || 'next').split(/[\s,]+/).filter(Boolean);
  if (wanted.length === 1 && wanted[0] === 'all') return [...modules];
  if (wanted.length === 1 && wanted[0] === 'next') {
    const day = Math.floor(date.getTime() / DAY_MS);
    return [modules[day % modules.length]];
  }
  return wanted.map((id) => {
    const found = modules.find((m) => m.id === id);
    if (!found) throw new Error(`no module called "${id}"; known: ${modules.map((m) => m.id).join(', ')}`);
    return found;
  });
}
