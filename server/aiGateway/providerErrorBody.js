// Gemini's OpenAI-compatible endpoint returns a failure as a one-element
// array, `[{ error: { message, status } }]`, and a blocked prompt as
// `promptFeedback` / `candidates[].finishReason` with an empty message.
// Reading only `body.error.message` on a plain object dropped those and the
// chat said "It gave no reason."

export const BLOCK_SENTENCES = {
  SAFETY: 'Safety filters blocked the reply',
  IMAGE_SAFETY: 'Safety filters blocked the image',
  PROHIBITED_CONTENT: 'The prompt was blocked as prohibited content',
  RECITATION: 'The reply was blocked as a recitation',
  BLOCKLIST: 'The reply was blocked by a blocklist',
  SPII: 'The reply was blocked as sensitive personal information',
  OTHER: 'The model blocked the reply for another filter',
  BLOCK_REASON_UNSPECIFIED: 'The model blocked the prompt and named no category',
  FINISH_REASON_UNSPECIFIED: 'The model stopped and named no reason',
};

export function providerErrorFields(body) {
  const parsed = parseBody(body);
  const root = firstRecord(parsed);
  const error = errorRecord(root);
  const rawMessage = firstText(
    error?.message,
    blockMessage(root),
    blockMessage(error),
    violationText(error),
    plainBlock(root),
    plainBlock(error),
    parsed ? '' : (typeof body === 'string' ? body : ''),
  );
  const errorType = firstText(
    stringField(error, 'type'),
    stringField(error, 'status'),
    stringField(error, 'code'),
    detailReason(error),
    blockReason(root),
    blockReason(error),
    finishReason(root),
  );
  return { rawMessage, errorType };
}

function parseBody(body) {
  if (body && typeof body === 'object') return body;
  const text = String(body ?? '').trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function firstRecord(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.find((item) => item && typeof item === 'object' && !Array.isArray(item)) || null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed;
}

function errorRecord(root) {
  if (!root) return null;
  const error = root.error;
  if (error && typeof error === 'object' && !Array.isArray(error)) return error;
  return root;
}

function feedback(node) {
  if (!node || typeof node !== 'object') return null;
  return node.promptFeedback || node.prompt_feedback || null;
}

function blockReason(node) {
  const note = feedback(node);
  return firstText(note?.blockReason, note?.block_reason);
}

function blockMessage(node) {
  const note = feedback(node);
  return firstText(note?.blockReasonMessage, note?.block_reason_message);
}

function finishReason(node) {
  const candidate = node?.candidates?.[0];
  return firstText(candidate?.finishReason, candidate?.finish_reason);
}

function blockedCategory(node) {
  const lists = [
    node?.candidates?.[0]?.safetyRatings,
    node?.candidates?.[0]?.safety_ratings,
    feedback(node)?.safetyRatings,
    feedback(node)?.safety_ratings,
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const hit = list.find((rating) => rating?.blocked === true && typeof rating.category === 'string' && rating.category.trim());
    if (hit) return hit.category.trim();
  }
  return '';
}

function plainBlock(node) {
  const reason = blockReason(node) || finishReason(node);
  const category = blockedCategory(node);
  if ((reason === 'SAFETY' || !reason) && category) {
    return `Safety filters blocked the reply (${category})`;
  }
  return BLOCK_SENTENCES[reason] || '';
}

function violationText(error) {
  const details = Array.isArray(error?.details) ? error.details : [];
  for (const item of details) {
    const violations = item?.fieldViolations || item?.field_violations || [];
    if (!Array.isArray(violations)) continue;
    for (const violation of violations) {
      if (typeof violation?.description === 'string' && violation.description.trim()) {
        return violation.description.trim();
      }
    }
  }
  return '';
}

function detailReason(error) {
  const details = Array.isArray(error?.details) ? error.details : [];
  const found = details.find((item) => typeof item?.reason === 'string' && item.reason.trim());
  return found?.reason || '';
}

function stringField(node, key) {
  return typeof node?.[key] === 'string' ? node[key] : '';
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
