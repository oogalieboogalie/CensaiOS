// Why something failed, in words a business owner can act on. The raw
// error stays available underneath ("Show the exact error"); this is the
// first line people read. Pure.

const RULES = [
  [/invalid.?api.?key|incorrect api key|unauthori[sz]ed|\b401\b|authentication|permission denied.*key|x-api-key/i,
    'The AI provider turned down the key. Check the key in Settings, Keys.'],
  [/no (api )?key|missing (api )?key|key (is )?not set|add (a|your) key|needs? a key|BYOK/i,
    'No AI key is set up for this. Add one in Settings, Keys.'],
  [/credit|quota|billing|insufficient.?funds|payment required|\b402\b|exceeded your current/i,
    'The AI account is out of credit or over its plan limit.'],
  [/rate.?limit|too many requests|\b429\b|overloaded|\b529\b/i,
    'The AI provider is busy and asked to slow down. Trying again in a minute usually works.'],
  [/time(d)? ?out|timeout|took too long|ETIMEDOUT|deadline/i,
    'It took too long and was stopped.'],
  [/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network|could not reach|connection (reset|refused)|socket hang up/i,
    'Could not reach the service it needed. Check the internet connection or that the service is running.'],
  [/docker.*(not running|daemon|cannot connect)|is the docker daemon running/i,
    'Docker is not running on this computer. Start Docker Desktop and try again.'],
  [/context.?length|too many tokens|maximum context|prompt is too long/i,
    'The request was too long for this model. Try a shorter request or a model with a bigger memory.'],
  [/content.?policy|safety|refus/i,
    'The model declined this request.'],
  [/stopped\.?$|aborted|cancel/i,
    'Someone stopped it.'],
  [/exited with code|exit code/i,
    'The program quit with an error. The exact message is below.'],
  [/can't use|cannot use|not equipped|equip /i,
    null], // already written for people: keep the original
];

const MAX = 180;

function clip(text, max = MAX) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * { plain, raw }: `plain` is the sentence to show; `raw` is the original
 * error when it says something more, else null.
 */
export function plainReason(error) {
  const raw = clip(typeof error === 'string' ? error : error?.message || error?.error || '', 400);
  if (!raw) return { plain: 'It stopped with an error but gave no reason.', raw: null };
  for (const [rule, plain] of RULES) {
    if (rule.test(raw)) return plain ? { plain, raw: raw === plain ? null : raw } : { plain: clip(raw), raw: null };
  }
  return { plain: clip(raw), raw: raw.length > MAX ? raw : null };
}
