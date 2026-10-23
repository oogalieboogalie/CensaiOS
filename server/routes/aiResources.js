import express from 'express';
import { resourceRateLimiter } from '../middleware/standardRateLimits.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { buildAiResources } from '../aiResources/summary.js';
import { heldKey } from '../aiResources/holdings.js';
import { setBudget, setProviderReading } from '../aiResources/ledger.js';
import { keyIdentity } from '../aiResources/keyIdentity.js';
import { readProviderBalance } from '../aiResources/providerBalance.js';
import { getUserApiKeyConfig } from '../security/userApiKeys.js';

/**
 * The AI resources window (Add > AI resources). Everyone sees their own keys
 * (masked to the last four characters), what censaiOS spent through them and
 * what is left of the amount they typed in. Account names on the computer's
 * coding CLIs and the key-sharing list are for the owner only. No route ever
 * returns a key.
 */
export const aiResourcesRouter = express.Router();
aiResourcesRouter.use(resourceRateLimiter);

const log = createLogger('ai-resources');
const MAX_BUDGET = 1_000_000;

function signedIn(req, res) {
  if (req.session?.userId) return true;
  res.status(401).json({ error: 'Sign in first.' });
  return false;
}

aiResourcesRouter.get('/', async (req, res) => {
  if (!signedIn(req, res)) return;
  try {
    res.json(await buildAiResources({ userId: req.session.userId, userRole: req.session.userRole }));
  } catch (err) {
    log.error('could not build the AI resources view', { code: safeErrorCode(err) });
    res.status(500).json({ error: 'Could not load your AI resources.' });
  }
});

aiResourcesRouter.put('/budget', async (req, res) => {
  if (!signedIn(req, res)) return;
  const raw = req.body?.budgetUsd;
  const budgetUsd = raw === null || raw === '' ? null : Number(raw);
  if (budgetUsd !== null && (!Number.isFinite(budgetUsd) || budgetUsd < 0 || budgetUsd > MAX_BUDGET)) {
    return res.status(400).json({ error: 'Type an amount in dollars, like 25 or 12.50.' });
  }
  try {
    const key = await heldKey(req.session.userId, String(req.body?.keyId || ''));
    if (!key) return res.status(404).json({ error: 'That key is not one of yours.' });
    setBudget({ keyId: key.keyId, provider: key.provider, last4: key.last4, budgetUsd });
    log.info('starting amount saved', { provider: key.provider, cleared: budgetUsd === null });
    res.json({ ok: true });
  } catch (err) {
    log.error('could not save a starting amount', { code: safeErrorCode(err) });
    res.status(500).json({ error: 'Could not save that amount.' });
  }
});

aiResourcesRouter.post('/ask-provider', async (req, res) => {
  if (!signedIn(req, res)) return;
  try {
    const key = await heldKey(req.session.userId, String(req.body?.keyId || ''));
    if (!key) return res.status(404).json({ error: 'That key is not one of yours.' });
    const config = await getUserApiKeyConfig(req.session.userId, key.provider);
    if (!config?.apiKey || keyIdentity(key.provider, config.apiKey)?.id !== key.keyId) {
      return res.status(409).json({ error: 'That key changed. Reload the window and try again.' });
    }
    // readProviderBalance writes the one log line for this ask.
    const reading = await readProviderBalance(key.provider, config.apiKey);
    res.json({ reading: setProviderReading(key, reading) });
  } catch (err) {
    if (!err.plain) log.warn('provider balance check failed', { code: safeErrorCode(err) });
    res.status(502).json({ error: err.plain ? err.message : 'Could not ask the provider. Try again.' });
  }
});
