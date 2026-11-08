// Where a step's answer ("what the helper said") sits in a Step cards
// window's shared fields: `cards/<card>/steps/<step>/report`, counted in the
// window's own saved list (the screen may hide a broken card or step, so its
// order is not used). Null when the card or step is not on the window.

/** The path for the answer of step `stepIndex` on card `cardIndex`. */
export const stepReportField = (cardIndex, stepIndex) => `cards/${cardIndex}/steps/${stepIndex}/report`;

/** The answer's path for one card and step, found by their ids; null when missing. */
export function reportFieldOf(cards, cardId, stepId) {
  if (!Array.isArray(cards)) return null;
  const cardIndex = cards.findIndex((c) => c && c.id === cardId);
  const steps = cardIndex >= 0 ? cards[cardIndex].steps : null;
  if (!Array.isArray(steps)) return null;
  const stepIndex = steps.findIndex((s) => s && s.id === stepId);
  return stepIndex >= 0 ? stepReportField(cardIndex, stepIndex) : null;
}
