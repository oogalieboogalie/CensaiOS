// The shared draft shape every platform reader returns, and the helpers that
// record what carried over (model, tools) and what did not. Split out of
// platforms.js to keep each file within the size budget.

import { cleanText, mapTools, resolveModel } from './mapping.js';

export function draft(platform, fields) {
  return {
    platform,
    name: cleanText(fields.name, 128) || 'Imported agent',
    description: cleanText(fields.description, 5000),
    instructions: cleanText(fields.instructions),
    provider: fields.provider,
    model: fields.model,
    tools: fields.tools || [],
    voice: fields.voice || null,
    carried: fields.carried || [],
    notCarried: fields.notCarried || [],
  };
}

export function withModel(rawModel, fallback, carried, notCarried) {
  const resolved = resolveModel(rawModel, fallback);
  if (rawModel && !resolved.guessed) carried.push(resolved.model === rawModel ? `Model ${rawModel}` : `Model ${rawModel} → ${resolved.model}`);
  else if (rawModel) notCarried.push({ name: `Model ${rawModel}`, why: `Not a model censaiOS knows; set to ${resolved.model || 'the board default'} on ${resolved.provider}. Change it in the Agent Designer if you like.` });
  else carried.push(`No model named; using ${resolved.model} on ${resolved.provider}`);
  return resolved;
}

export function addTools(rawTools, carried, notCarried) {
  const mapped = mapTools(rawTools);
  carried.push(...mapped.carried);
  notCarried.push(...mapped.notCarried);
  return mapped.tools;
}
