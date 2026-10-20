// "Who uses what" for this board: the chat windows and terminals that are
// open right now, each joined to the key or sign-in that pays for it.
// Pure, so the window and its tests share it.

const ROUTES = {
  vault: 'your key',
  env: 'this computer\'s .env key',
  shared: 'this computer\'s key (shared by the owner)',
  missing: 'no key yet: add one in Settings',
  local: 'a model on this computer (free)',
  default: 'censaiOS\'s default model',
};

export function routeLabel(route) {
  return ROUTES[route] || 'unknown';
}

function keyFor(keys, keyId) {
  return keyId ? keys.find((k) => k.keyId === keyId) || null : null;
}

/** Spending recorded for one chat window, across every key. */
function windowSpend(keys, windowId) {
  let costUsd = 0;
  let calls = 0;
  for (const card of keys) {
    for (const row of card.users || []) {
      if (row.kind === 'window' && row.ref === windowId) { costUsd += row.costUsd || 0; calls += row.calls || 0; }
    }
  }
  return { costUsd, calls };
}

export function chatRows(wins = [], data = {}) {
  const agents = new Map((data.agents || []).map((a) => [String(a.id), a]));
  return wins.filter((w) => w.kind === 'chat' && w.agentId).map((w) => {
    const agent = agents.get(String(w.agentId)) || null;
    const key = keyFor(data.keys || [], agent?.keyId);
    return {
      windowId: w.id,
      title: w.title || agent?.name || 'Chat',
      agentId: w.agentId,
      provider: agent?.provider || null,
      model: agent?.model || null,
      route: agent?.route || 'default',
      masked: key?.masked || null,
      ...windowSpend(data.keys || [], w.id),
    };
  });
}

const CLI_VIA = {
  'cli-login': 'its own sign-in',
  vault: 'your saved key (vault, or .env for the owner)',
  toolchains: 'a key in Toolchains settings',
  env: 'a key in this computer\'s .env',
};

export function cliVia(via) {
  return CLI_VIA[via] || 'not signed in';
}

export function terminalRows(wins = [], data = {}) {
  const clis = new Map((data.clis || []).map((c) => [c.id, c]));
  return wins.filter((w) => w.kind === 'terminal').map((w) => {
    const cli = w.launchCli ? clis.get(w.launchCli) || null : null;
    return {
      windowId: w.id,
      title: w.title || (cli ? cli.label : 'Terminal'),
      cli: cli?.label || null,
      plain: !w.launchCli,
      via: cli ? cliVia(cli.signedIn ? cli.signedInVia : null) : null,
      account: cli?.account || null,
      accountHidden: Boolean(cli?.accountHidden),
    };
  });
}
