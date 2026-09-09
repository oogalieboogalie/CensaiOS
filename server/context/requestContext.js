function readWorkspaceId(req) {
  const candidates = [
    req?.body?.workspaceId,
    req?.query?.workspaceId,
    req?.params?.workspaceId,
  ];
  for (const candidate of candidates) {
    const workspaceId = String(candidate ?? '').trim();
    if (workspaceId) return workspaceId;
  }
  throw new Error('workspaceId is required');
}

export function workspaceContextFromRequest(req) {
  return { workspaceId: readWorkspaceId(req) };
}
