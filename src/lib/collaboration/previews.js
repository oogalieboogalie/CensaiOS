// Pure helpers for the live-collaboration socket: where to connect, and how
// remote previews (window drags, typing, live text) overlay the local windows.
// Kept out of the hook so they can be tested without React or a WebSocket.

const PATH = '/ws/workspace-collaboration';

export function collaborationUrl(workspaceId, clientId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}${PATH}?workspaceId=${encodeURIComponent(workspaceId)}`
    + `&clientId=${encodeURIComponent(clientId)}`;
}

export function mergeCollaborationPreviews(wins, previews, presence = {}, activeId = null) {
  const { text = {}, typing = {} } = presence;
  return wins.map((win) => {
    const preview = previews[win.id];
    const remote = text[win.id];
    const typer = typing[win.id];
    let next = preview ? {
      ...win,
      x: preview.x,
      y: preview.y,
      collaborationActor: preview.actor,
    } : win;
    if (typer) {
      next = { ...next, typingActor: { ...typer.actor, label: `${typer.actor?.label || 'Someone'} typing…` } };
    }
    // Live remote text for viewers only — never clobber the locally focused editor.
    if (remote && win.id !== activeId && (win.kind === 'doc' || win.kind === 'code_editor')) {
      next = {
        ...next,
        text: remote.text,
        code: win.kind === 'code_editor' ? remote.text : next.code,
        typingActor: remote.actor
          ? { ...remote.actor, label: `${remote.actor?.label || 'Someone'} typing…` }
          : next.typingActor,
      };
    }
    return next;
  });
}
