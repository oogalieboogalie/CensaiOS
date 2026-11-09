// One fixed spelling of a workflow graph, so the window and the server
// agree on whether it is still the graph someone turned auto start on for.

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Steps and lines only. The same graph spells the same, whatever the key order. */
export function graphCanonical(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  return canonicalJson(JSON.parse(JSON.stringify({ nodes, edges })));
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of that spelling. Armed triggers keep this and refuse a different graph. */
export async function graphHash(graph) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(graphCanonical(graph)));
  return hex(digest);
}
