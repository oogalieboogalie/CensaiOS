import express from 'express';
import pool from '../db.js';
import { encryptKey } from '../security/vault.js';
import {
  normalizeUserApiKeyProvider,
  subscriptionTokenProblem,
  USER_API_KEY_PROVIDERS,
} from '../security/userApiKeys.js';
import { ownerEnvKeyProviders } from '../security/envKeys.js';

export const keysRouter = express.Router();

// Get configured keys status
keysRouter.get('/keys', async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT provider, base_url, model_name, updated_at
       FROM user_api_keys
       WHERE user_id = $1 AND provider = ANY($2)`,
      [userId, USER_API_KEY_PROVIDERS]
    );

    const keys = rows.map(r => ({
      provider: r.provider,
      hasKey: true,
      source: 'vault',
      baseUrl: r.base_url,
      modelName: r.model_name,
      updatedAt: r.updated_at
    }));
    // A local install's owner also has the keys in the server's .env. Only
    // which providers, never the key itself; a saved key still wins.
    const saved = new Set(keys.map(k => k.provider));
    for (const provider of await ownerEnvKeyProviders(pool, userId)) {
      if (!saved.has(provider)) keys.push({ provider, hasKey: true, source: 'env' });
    }

    res.json(keys);
  } catch (err) {
    console.error('Failed to list keys:', err);
    res.status(500).json({ error: err.message });
  }
});

// Set or update a key
keysRouter.post('/keys', async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const provider = normalizeUserApiKeyProvider(req.body?.provider);
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
  const modelName = typeof req.body?.modelName === 'string' ? req.body.modelName.trim() : '';

  if (!provider) {
    return res.status(400).json({ error: 'Unsupported provider' });
  }
  if (!apiKey) {
    return res.status(400).json({ error: 'API Key is required' });
  }
  if (apiKey.length > 16384) {
    return res.status(400).json({ error: 'API Key is too long' });
  }
  if (modelName.length > 100) {
    return res.status(400).json({ error: 'Model name is too long' });
  }
  const tokenProblem = subscriptionTokenProblem(provider, apiKey);
  if (tokenProblem) {
    return res.status(400).json({ error: tokenProblem });
  }

  try {
    const encrypted = encryptKey(apiKey, userId);

    await pool.query(
      `INSERT INTO user_api_keys (user_id, provider, api_key_encrypted, base_url, model_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, provider) DO UPDATE
       SET api_key_encrypted = $3, base_url = $4, model_name = $5, updated_at = NOW()`,
      [userId, provider, encrypted, null, modelName || null]
    );

    res.status(201).json({ ok: true, provider });
  } catch (err) {
    console.error('Failed to save API key:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a key configuration
keysRouter.delete('/keys/:provider', async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const provider = normalizeUserApiKeyProvider(req.params.provider);
  if (!provider) {
    return res.status(400).json({ error: 'Unsupported provider' });
  }

  try {
    await pool.query(
      'DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete API key:', err);
    res.status(500).json({ error: err.message });
  }
});
