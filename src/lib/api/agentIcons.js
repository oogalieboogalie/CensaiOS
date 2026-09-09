/**
 * Calls the server AI icon endpoint (chat model writes raw SVG).
 * The server enforces the CENSAAI_AGENT_ICON_GENERATOR flag — a 403
 * here means generation is disabled server-side.
 * @param {{prompt: string, kind?: string}} args
 * @returns {Promise<string>} raw SVG markup
 */
export async function iconGenerate({ prompt, kind = 'agent' } = {}) {
  const res = await fetch('/api/agent-icons/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, kind }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || 'Icon generation failed');
  if (!data?.svg) throw new Error('Icon endpoint returned no SVG');
  return data.svg;
}
