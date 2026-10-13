/**
 * @fileoverview AI-Induced Technical Debt Mitigation ESLint Plugin
 * @author Jules
 */
"use strict";

const noMonolith = require("./rules/no-monolith");
const requireIntent = require("./rules/require-intent");
const aiMarker = require("./rules/ai-marker");

module.exports = {
  rules: {
    "no-monolith": noMonolith,
    "require-intent": requireIntent,
    "ai-marker": aiMarker,
  },
  configs: {
    recommended: {
      plugins: ["ai-debt"],
      rules: {
        "ai-debt/no-monolith": ["warn", { maxLines: 250 }],
        "ai-debt/require-intent": "warn",
        "ai-debt/ai-marker": "error",
      },
    },
  },
};
