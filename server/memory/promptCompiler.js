/**
 * Compiles a system prompt template using equipped attributes in a madlib style.
 *
 * Placeholders are enclosed in {{ ... }} and variables are prefixed with $.
 * Example: "You are {{ a very $meticulous and $friendly }} assistant."
 *
 * Rules:
 * 1. If none of the variables in a block are equipped, the entire block is replaced with "".
 * 2. If at least one variable is equipped, the block is rendered and variables are joined naturally.
 *
 * @param {string} template The system prompt template with madlib blocks.
 * @param {Object} equippedAttributes Map of attribute ID to value (e.g. { meticulous: 'extremely meticulous...' })
 * @returns {string} The compiled system prompt.
 */
export function compilePromptTemplate(template, equippedAttributes = {}) {
  if (!template) return '';

  // Find all {{ ... }} blocks
  const compiled = template.replace(/\{\{([\s\S]*?)\}\}/g, (match, blockContent) => {
    // Find all variable names inside this block, e.g. $meticulous
    const varRegex = /\$([a-zA-Z0-9_-]+)/g;
    const varMatches = [...blockContent.matchAll(varRegex)];

    if (varMatches.length === 0) {
      // No variables inside the block, just return the content as-is
      return blockContent;
    }

    // Look up active attribute values
    const activeAttrs = [];
    varMatches.forEach(m => {
      const attrId = m[1];
      const val = equippedAttributes[attrId];
      if (val) {
        activeAttrs.push({
          rawName: m[0], // e.g. "$meticulous"
          index: m.index,
          value: val,
        });
      }
    });

    if (activeAttrs.length === 0) {
      // None of the variables in this block are equipped - collapse the entire block
      return '';
    }

    // Format values using natural join
    let formattedList = '';
    const values = activeAttrs.map(a => a.value);
    if (values.length === 1) {
      formattedList = values[0];
    } else if (values.length === 2) {
      formattedList = `${values[0]} and ${values[1]}`;
    } else {
      formattedList = `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
    }

    // Replace the variable list range
    const firstAttr = varMatches[0];
    const lastAttr = varMatches[varMatches.length - 1];
    const startIndex = firstAttr.index;
    const endIndex = lastAttr.index + lastAttr[0].length;

    const prefix = blockContent.substring(0, startIndex);
    const suffix = blockContent.substring(endIndex);

    const compiledBlock = (prefix + formattedList + suffix).trim().replace(/  +/g, ' ');
    return compiledBlock;
  });

  // Clean up any double spaces introduced by empty blocks collapsing
  return compiled.replace(/  +/g, ' ').trim();
}
