// An agent runs only the tools it was given. A model can name any tool, one
// it knows from its training or one that words in the conversation (a page
// it read, a file, an outside app's question) ask for, and that tool used to
// run even though the agent was never given it. So each loop that runs a
// model's tool calls (a chat, an agent waking up, a delegated task) checks
// the name against the tools it offered, and answers any other name with
// these words without running anything.

/** The names of the tools a loop offered its model. */
export function offeredToolNames(tools) {
  return new Set((Array.isArray(tools) ? tools : []).map((tool) => tool?.function?.name).filter(Boolean));
}

/** What the model gets back for a call to a tool it was not given; "Error:" marks the call as not done. */
export function toolNotOfferedResult(name) {
  const shown = String(name ?? '').slice(0, 80);
  return `Error: "${shown}" is not one of the tools you were given here, so it did not run. Use only the tools you were given, and tell the person in plain words if they cannot do what was asked.`;
}
