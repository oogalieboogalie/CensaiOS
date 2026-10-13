/**
 * @fileoverview Rule to flag files that exceed the line limit.
 * @author Jules
 */
"use strict";

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "flag files that exceed the line limit (monoliths)",
      category: "AI Technical Debt",
      recommended: false,
    },
    schema: [
      {
        type: "object",
        properties: {
          maxLines: {
            type: "integer",
            minimum: 0,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      monolith: "File is too large ({{ lineCount }} lines). Max allowed is {{ maxLines }}. Split the file to reduce AI context overhead.",
    },
  },

  create(context) {
    const maxLines = (context.options[0] && context.options[0].maxLines) || 250;
    const sourceCode = context.getSourceCode();
    const lineCount = sourceCode.lines.length;

    return {
      Program(node) {
        if (lineCount > maxLines) {
          context.report({
            node,
            messageId: "monolith",
            data: {
              lineCount,
              maxLines,
            },
          });
        }
      },
    };
  },
};
