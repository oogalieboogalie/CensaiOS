// The one place censaiOS names its default chat model (shared/, so the server
// and the browser both read it without reaching into each other). The server
// (aiGateway/providers.js), the model menus and the Rook window all read it
// from here, so changing it is a one-line edit.
//
// An owner's AI_MODEL setting wins over it. Either way, when Ollama no longer
// offers the model, chat picks one Ollama does offer (aiGateway/ollamaModels.js),
// so a retired name never leaves chat dead.
export const SHIPPED_DEFAULT_CHAT_MODEL = 'gpt-oss:120b-cloud';

// Ollama models that are retired, or announced to retire, with the date.
// Chat never sends to these: it picks another model instead. A test fails
// when the shipped default is on this list or retires within 30 days.
// Sources: Ollama's library pages (minimax-m2.5 retired 2026-07-31,
// minimax-m2.7 retiring 2026-11-18), as read 2026-10-31.
export const RETIRED_OLLAMA_MODELS = Object.freeze({
  'minimax-m2.5': '2026-07-31',
  'minimax-m2.7': '2026-11-18',
});

/** "minimax-m2.5:cloud" and "minimax-m2.5" are both "minimax-m2.5". */
export function ollamaModelFamily(name) {
  return String(name || '').trim().toLowerCase().split(':')[0];
}

/** The retirement date of an Ollama model, or null when none is known. */
export function ollamaRetirementDate(name) {
  return RETIRED_OLLAMA_MODELS[ollamaModelFamily(name)] || null;
}

/** True once the model's retirement day has come. */
export function isRetiredOllamaModel(name, now = new Date()) {
  const date = ollamaRetirementDate(name);
  return Boolean(date) && new Date(`${date}T00:00:00Z`).getTime() <= now.getTime();
}
