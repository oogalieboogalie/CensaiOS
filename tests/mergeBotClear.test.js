import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { activeClear, matchingCi, reviewClear } from '../server/mergeBot/clear.js';
import { decideMerge } from '../server/mergeBot/decide.js';
import { createRevokeStore, revokeStateFile } from '../server/mergeBot/revokes.js';
import { clearMessage } from '../server/mergeBot/signature.js';
import { gatekeeperKeys } from './mergeBotSign.js';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const REPO = 'acme/widgets';
const APP = 15368;

function seen(body, at = '2026-11-11T00:00:01Z', updatedAt = '') {
  return { body, createdAt: at, updatedAt };
}

describe('signed gatekeeper clear', () => {
  const keys = gatekeeperKeys();
  const look = { publicKey: keys.pem, repo: REPO, number: 12, sha: SHA };

  test('a signed line clears, including one pasted inside a code fence', () => {
    const line = keys.line('clear', REPO, 12, SHA);
    expect(activeClear([seen(line)], look)).toEqual({ sha: SHA });
    expect(activeClear([seen(`notes\n\`\`\`\n${line}\n\`\`\``)], look)).toEqual({ sha: SHA });
  });

  test('an unsigned line, a quote, another account, and a needs-changes note do not clear', () => {
    expect(activeClear([seen(`gatekeeper-clear: ${SHA}`)], look)).toBeNull();
    expect(activeClear([seen(`> ${keys.line('clear', REPO, 12, SHA)}`)], look)).toBeNull();
    const note = `NEEDS CHANGES\nonce fixed I would post:\ngatekeeper-clear: ${SHA}`;
    expect(activeClear([seen(note)], look)).toBeNull();
  });

  test('a signature for another key, repo, pull request, or commit fails closed', () => {
    const other = gatekeeperKeys();
    expect(activeClear([seen(other.line('clear', REPO, 12, SHA))], look)).toBeNull();
    expect(activeClear([seen(keys.line('clear', 'other/repo', 12, SHA))], look)).toBeNull();
    expect(activeClear([seen(keys.line('clear', REPO, 99, SHA))], look)).toBeNull();
    expect(activeClear([seen(keys.line('clear', REPO, 12, OTHER))], look)).toBeNull();
    expect(activeClear([seen(keys.line('clear', REPO, 12, SHA))], { ...look, publicKey: '' })).toBeNull();
    expect(activeClear([seen(keys.line('clear', REPO, 12, SHA))], { ...look, publicKey: 'not-a-key' })).toBeNull();
  });

  test('editing the commit in a signed line does not keep the clear', () => {
    const line = keys.line('clear', REPO, 12, SHA).replace(SHA, OTHER);
    expect(activeClear([seen(line, '1', '2')], look)).toBeNull();
  });

  test('a later needs-changes note or signed revoke on that commit takes the clear back for good', () => {
    const clear = seen(keys.line('clear', REPO, 12, SHA), '1');
    const needs = seen(`Verdict: NEEDS CHANGES\nHead ${SHA}`, '2');
    expect(activeClear([clear, needs], look)).toBeNull();
    const again = seen(keys.line('clear', REPO, 12, SHA), '3');
    expect(activeClear([clear, needs, again], look)).toBeNull();
    const revoke = seen(keys.line('revoke', REPO, 12, SHA), '4');
    expect(activeClear([clear, again, revoke], look)).toBeNull();
  });

  test('re-pasting or editing the old clear does not undo a revoke', () => {
    const line = keys.line('clear', REPO, 12, SHA);
    const edited = seen(line, '1', '9');
    const needs = seen(`needs-changes\n${SHA}`, '2');
    expect(activeClear([edited, needs], look)).toBeNull();
    expect(activeClear([needs, seen(line, '8')], look)).toBeNull();
  });

  test('a hyphen, odd spacing, or a short commit prefix revokes the head', () => {
    const clear = seen(keys.line('clear', REPO, 12, SHA), '1');
    expect(activeClear([clear, seen(`please needs-changes ${SHA.slice(0, 7)}`, '2')], look)).toBeNull();
    expect(activeClear([clear, seen('needs\tchanges\n' + SHA, '2')], look)).toBeNull();
    expect(activeClear([clear, seen(`needs   changes ${SHA}`, '2')], look)).toBeNull();
  });

  test('a bare needs-changes, needs_changes, needschanges, or not-cleared note revokes', () => {
    const clear = seen(keys.line('clear', REPO, 12, SHA), '1');
    expect(activeClear([clear, seen('NEEDS CHANGES', '2')], look)).toBeNull();
    expect(activeClear([clear, seen('needs_changes', '2')], look)).toBeNull();
    expect(activeClear([clear, seen('needschanges', '2')], look)).toBeNull();
    expect(activeClear([clear, seen('NEEDS CHANGES 20261111 deadbeef', '2')], look)).toBeNull();
    expect(activeClear([clear, seen(`NOT CLEARED ${SHA}`, '2')], look)).toBeNull();
    expect(activeClear([clear, seen(`NOT CLEARED ${OTHER}`, '2')], { ...look, commits: [SHA, OTHER] })).toEqual({ sha: SHA });
  });

  test('a request-changes review sticks to its commit, and a saved revoke survives a deleted comment', () => {
    const line = keys.line('clear', REPO, 12, SHA);
    const review = { state: 'CHANGES_REQUESTED', body: '', createdAt: '2', commitId: SHA };
    expect(activeClear([seen(line, '1'), review], look)).toBeNull();
    const other = { state: 'CHANGES_REQUESTED', body: '', createdAt: '2', commitId: OTHER };
    expect(activeClear([seen(line, '1'), other], look)).toEqual({ sha: SHA });
    expect(reviewClear([seen(line, '1'), other], look).remember).toContain(OTHER);
    expect(activeClear([seen(line, '1'), { state: 'CHANGES_REQUESTED', body: '', createdAt: '2' }], look)).toBeNull();
    const verdict = reviewClear([seen(line, '1'), seen(`needs-changes ${SHA}`, '2')], look);
    expect(verdict.clear).toBeNull();
    const file = path.join(os.tmpdir(), `revokes-${process.pid}-${Date.now()}.json`);
    const store = createRevokeStore({ file });
    store.remember(REPO, 12, verdict.remember);
    const again = createRevokeStore({ file });
    expect(activeClear([seen(line, '9')], { ...look, revoked: again.forPull('Acme/Widgets', 12) })).toBeNull();
    fs.rmSync(file, { force: true });
  });

  test('the repo name in a signature is not case sensitive, and other key types are refused', () => {
    const line = keys.line('clear', 'Acme/Widgets', 12, SHA);
    expect(activeClear([seen(line)], { ...look, repo: 'acme/widgets' })).toEqual({ sha: SHA });
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ type: 'spki', format: 'pem' });
    expect(activeClear([seen(line)], { ...look, publicKey: rsa })).toBeNull();
    expect(activeClear([seen(line)], { ...look, publicKey: ec })).toBeNull();
    const rawPrivate = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    expect(activeClear([seen(line)], { ...look, publicKey: rawPrivate })).toBeNull();
    const pasted = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
    expect(activeClear([seen(pasted)], look)).toBeNull();
    expect(activeClear([seen(line)], { ...look, publicKey: pasted })).toBeNull();
  });

  test('revokes stay on the state volume, and nowhere else inside the repo', () => {
    const root = '/app';
    expect(revokeStateFile({
      env: { CENSAI_STATE_DIR: '/app/.homebase-state' },
      home: '/root',
      root,
    // The state dir is made absolute, which on Windows adds a drive letter.
    })).toBe(path.join(path.resolve('/app/.homebase-state'), 'merge-bot', 'revokes.json'));
    expect(revokeStateFile({
      env: { CENSAI_STATE_DIR: '/var/lib/censai' },
      home: '/root',
      root,
    })).toBe(path.join(path.resolve('/var/lib/censai'), 'merge-bot', 'revokes.json'));
    expect(revokeStateFile({ env: {}, home: '/home/dev', root })).toBe(
      path.join('/home/dev', '.local', 'share', 'censai', 'merge-bot', 'revokes.json'),
    );
    expect(() => revokeStateFile({
      env: { CENSAI_STATE_DIR: '/app/src' },
      home: '/root',
      root,
    })).toThrow(expect.objectContaining({ code: 'revokes-unavailable' }));
    expect(() => revokeStateFile({ env: {}, home: '/app', root })).toThrow(
      expect.objectContaining({ code: 'revokes-unavailable' }),
    );
    expect(String(revokeStateFile({ env: {}, home: '/home/dev', root }))).not.toContain(`${path.sep}tmp${path.sep}`);
  });

  test('a needs-changes note for another commit on the pull request leaves this clear standing', () => {
    const clear = seen(keys.line('clear', REPO, 12, SHA), '1');
    const other = seen(`NEEDS CHANGES\n${OTHER}`, '2');
    expect(activeClear([clear, other], { ...look, commits: [SHA, OTHER] })).toEqual({ sha: SHA });
    expect(activeClear([clear, other], look)).toBeNull();
  });

  test('a pull request that changes the merge rules is not merged, even with a forged clear', () => {
    const forgedKey = generateKeyPairSync('ed25519');
    const forgedSig = sign(null, Buffer.from(clearMessage(REPO, 12, SHA)), forgedKey.privateKey).toString('base64');
    const forged = `gatekeeper-clear: ${SHA} pr=12 sig=${forgedSig}`;
    expect(activeClear([seen(forged)], look)).toBeNull();
    const decision = decideMerge({
      number: 12,
      headSha: SHA,
      base: 'master',
      files: ['server/mergeBot/risk.js'],
      clear: { sha: SHA },
      ci: { sha: SHA, conclusion: 'success', status: 'completed' },
      mergeable: true,
      lock: { ok: true },
      dryRun: false,
    });
    expect(decision.action).not.toBe('merge');
    expect(decision).toMatchObject({ action: 'confirm', reason: 'risky', categories: ['rules'] });
  });

  test('the latest Actions run has to be finished and green, and a queued rerun is not', () => {
    const green = { name: 'ci (22.x)', sha: SHA, conclusion: 'success', status: 'completed', completedAt: '1', appId: APP };
    const queued = { name: 'ci (22.x)', sha: SHA, conclusion: '', status: 'queued', appId: APP };
    expect(matchingCi([green, queued], { sha: SHA }).status).toBe('queued');
    const otherApp = { ...green, appId: 1, completedAt: '9' };
    expect(matchingCi([otherApp], { sha: SHA })).toBeNull();
    const red = { ...green, conclusion: 'failure', completedAt: '3' };
    expect(matchingCi([green, red], { sha: SHA }).conclusion).toBe('failure');
  });

  test('the sign script keeps the private key outside the repo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatekeeper-'));
    const key = path.join(dir, 'gatekeeper.pem');
    const pub = execFileSync(process.execPath, ['scripts/merge-bot/sign-clear.mjs', 'keygen', '--private', key], { encoding: 'utf8' });
    const line = execFileSync(process.execPath, [
      'scripts/merge-bot/sign-clear.mjs', 'sign', '--repo', REPO, '--pr', '12', '--sha', SHA, '--key', key,
    ], { encoding: 'utf8' });
    expect(pub).toContain('BEGIN PUBLIC KEY');
    expect(fs.readFileSync(key, 'utf8')).toContain('PRIVATE KEY');
    expect(activeClear([seen(line)], { ...look, publicKey: pub })).toEqual({ sha: SHA });
    expect(activeClear([seen(line)], { ...look, publicKey: fs.readFileSync(key, 'utf8') })).toBeNull();
    expect(() => execFileSync(process.execPath, ['scripts/merge-bot/sign-clear.mjs', 'keygen', '--private', 'gatekeeper.pem'], { stdio: 'pipe' })).toThrow();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
