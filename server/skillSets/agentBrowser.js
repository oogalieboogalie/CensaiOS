// An agent driving the Browser window equipped to it. The page opens in that
// window on the live board (everyone sees it), and the agent reads the page's
// text through Tavily Extract (the person's key, then the server's), so the
// server itself never fetches the address.
import { readDocWindows } from '../agent-registry/helpCards.js';
import { transactCanvasDoc } from '../collab/liveDoc.js';
import { upsertWindowInDoc } from '../collab/serverWriter.js';
import { createTavilyClient, resolveTavilyKey } from '../leadhound/tavily.js';
import { parseUrl } from '../../src/lib/browserUrl.js';

const PAGE_CHARS = 6000;

/** Pure: the Browser window equipped to this agent, if any. */
export function equippedBrowserWindow(wins, agentId) {
  return (wins || []).find((win) => win.kind === 'browser' && win.equippedAgentId === agentId) || null;
}

export async function equippedBrowserGo({ workspaceId, userId, agentId, url, focus }, deps = {}) {
  const target = parseUrl(String(url || ''), { embedYoutube: false });
  if (!/^https?:\/\//i.test(target)) return 'Error: give a web address or a search phrase.';
  const { transact = transactCanvasDoc, readWindows = readDocWindows, writeWindow = upsertWindowInDoc } = deps;
  let opened = null;
  await transact(workspaceId, (doc) => {
    const win = equippedBrowserWindow(readWindows(doc), agentId);
    if (!win) return;
    opened = { ...win, url: target, agentDrivenAt: new Date().toISOString() };
    writeWindow(doc, opened);
  });
  if (!opened) {
    return 'Error: no Browser window is equipped to you. Ask someone to open a Browser window and pick you in its "Equip to" menu.';
  }
  const { apiKey } = await (deps.resolveKey || resolveTavilyKey)(userId);
  if (!apiKey) return `Opened ${target} in your Browser window. Reading page text needs a Tavily key (Settings > AI keys).`;
  try {
    const client = (deps.makeClient || createTavilyClient)(apiKey, { purpose: 'read a page' });
    const text = String(await client.extract(target, focus || '') || '').slice(0, PAGE_CHARS);
    return `Opened ${target} in your Browser window.\n\n${text || '(The page had no readable text.)'}`;
  } catch (error) {
    return `Opened ${target} in your Browser window, but its text could not be read: ${error.message}`;
  }
}
