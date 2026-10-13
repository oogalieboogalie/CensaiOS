// AGENT NETWORK — a Research window answer as the plain text that goes on a
// help card and back to the asking agent: the answer, then its sources.
// Pure; shared by the browser and the server.

export function researchReply({ answer = '', sources = [] } = {}) {
  const list = (sources || []).map((s) => `[${s.n}] ${s.title}${s.url ? ` ${s.url}` : ''}`).join('\n');
  return list ? `${answer}\n\nSources:\n${list}` : answer;
}
