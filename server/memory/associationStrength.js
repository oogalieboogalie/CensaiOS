// server/memory/associationStrength.js
//
// How strong a link between two things is when it was made only because they
// sat side by side in one note (relations.js writes these; core/context.js
// decides which links reach an agent's instructions).

// A pair seen once, in one note.
export const CO_OCCURRENCE_START = 0.3;
// Added each time a later note puts the same two things side by side.
export const CO_OCCURRENCE_STEP = 0.1;
// Above this, a pair has been seen in at least two notes. Halfway to the
// second sighting, so a stored 0.3 that reads back as 0.30000001 never passes.
export const CO_OCCURRENCE_REPEATED = CO_OCCURRENCE_START + CO_OCCURRENCE_STEP / 2;
