// Switches for the merge bot. The token is read from the environment only.
// Dry-run stays on until MERGE_BOT_DRY_RUN is set to 0, false, or off.

export function mergeBotConfig(env = process.env) {
  const dry = String(env.MERGE_BOT_DRY_RUN ?? '').trim().toLowerCase();
  const interval = Number(env.MERGE_BOT_INTERVAL_MS);
  const checkName = String(env.MERGE_BOT_CI_CHECK || 'ci (22.x)').trim();
  return {
    enabled: String(env.MERGE_BOT_ENABLED || '').trim() === '1',
    dryRun: !(dry === '0' || dry === 'false' || dry === 'off'),
    token: String(env.MERGE_BOT_GITHUB_TOKEN || '').trim(),
    repo: String(env.MERGE_BOT_REPO || env.GITHUB_REPOSITORY || '').trim(),
    publicKey: String(env.MERGE_BOT_GATEKEEPER_PUBKEY || '').trim(),
    checkName: checkName || 'ci (22.x)',
    intervalMs: Number.isFinite(interval) && interval >= 60_000 ? interval : 15 * 60_000,
  };
}

export function repoParts(repo) {
  const match = String(repo || '').match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}
