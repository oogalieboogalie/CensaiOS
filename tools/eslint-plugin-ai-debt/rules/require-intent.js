/**
 * @fileoverview Rule to require an @intent tag in file-level comments.
 * @author Jules
 */
"use strict";

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "require an @intent tag to map code to architectural intent",
      category: "Knowledge Debt",
      recommended: false,
    },
    messages: {
      missingIntent: "Missing @intent tag in file-level comments. Link this file to its architectural purpose.",
    },
  },

  create(context) {
    return {
      Program(node) {
        const sourceCode = context.getSourceCode();
        const comments = sourceCode.getAllComments();
        const hasIntent = comments.some(comment => /@intent\b/.test(comment.value));

        if (!hasIntent) {
          context.report({
            node,
            messageId: "missingIntent",
          });
        }
      },
    };
  },
};
