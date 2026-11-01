// Gemini reads tool parameters as its own Schema type, a subset of JSON
// Schema. A request whose tools step outside it is a 400 for every message,
// short or long, while the same tools work with Claude. Three shapes in our
// tools did: a parameter typed as a list of types (`["string", "number"]`),
// keywords outside the subset (`additionalProperties`, `$schema`, `const`,
// `oneOf`...), and a tool that takes nothing written as an object with no
// properties. This rewrites those for Gemini only; other providers get the
// tools unchanged.

const KEPT = new Set([
  'type', 'format', 'title', 'description', 'nullable', 'enum', 'default', 'example',
  'items', 'minItems', 'maxItems', 'properties', 'required', 'minProperties', 'maxProperties',
  'propertyOrdering', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'anyOf',
]);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function oneType(types) {
  const named = types.filter((type) => typeof type === 'string' && type !== 'null');
  return { type: named[0] || 'string', nullable: types.includes('null') };
}

export function geminiSchema(schema) {
  if (!isRecord(schema)) return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!KEPT.has(key)) continue;
    if (key === 'properties' && isRecord(value)) {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, geminiSchema(child)]));
    } else if (key === 'items') {
      out.items = geminiSchema(value);
    } else if (key === 'anyOf' && Array.isArray(value)) {
      out.anyOf = value.map(geminiSchema);
    } else if (key === 'enum' && Array.isArray(value)) {
      out.enum = value.map(String);
    } else {
      out[key] = value;
    }
  }
  if (Array.isArray(schema.type)) {
    const { type, nullable } = oneType(schema.type);
    out.type = type;
    if (nullable) out.nullable = true;
  }
  if (out.enum && out.type && out.type !== 'string') out.type = 'string';
  if (Array.isArray(out.required) && isRecord(out.properties)) {
    out.required = out.required.filter((name) => name in out.properties);
  }
  return out;
}

function hasProperties(schema) {
  return isRecord(schema?.properties) && Object.keys(schema.properties).length > 0;
}

function geminiTool(tool) {
  const fn = tool?.function;
  if (!isRecord(fn) || !('parameters' in fn)) return tool;
  const { parameters, ...rest } = fn;
  // A tool that takes nothing: Gemini wants no parameters at all.
  if (!hasProperties(parameters)) return { ...tool, function: rest };
  return { ...tool, function: { ...rest, parameters: geminiSchema(parameters) } };
}

export function prepareGeminiToolPayload(payload) {
  if (!Array.isArray(payload?.tools) || payload.tools.length === 0) return payload;
  return { ...payload, tools: payload.tools.map(geminiTool) };
}
