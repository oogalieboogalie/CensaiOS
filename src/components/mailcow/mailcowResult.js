// What the Mailcow window does with an answer from /api/mailcow: a refusal
// (only this computer's owner may see or change the mail server) or any other
// failed request becomes the same plain words other windows show, and an
// answer where Mailcow itself said no becomes Mailcow's own message.
import { apiError, plainWords } from '../../lib/errorReport.js';

export async function readMailcowResult(res, { method = 'GET', path = '' } = {}) {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw apiError(res, data, `Mailcow request failed (${res.status})`, { method, path });
  const answers = Array.isArray(data) ? data : [data];
  const said = answers.filter((r) => r?.type === 'error').map((r) => r.msg);
  if (said.length) throw new Error(said.join('; '));
  if (!Array.isArray(data) && data?.error) throw new Error(data.error);
  return data;
}

export const mailcowErrorText = (err) => plainWords(err);
