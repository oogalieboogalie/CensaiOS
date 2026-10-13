function assertActorId(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new Error('Authenticated user required');
  return id;
}

export function actorFromRequest(req) {
  return {
    kind: 'user',
    id: assertActorId(req?.session?.userId),
  };
}
