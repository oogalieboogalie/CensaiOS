import { generateKeyPairSync, sign } from 'node:crypto';
import { clearMessage, revokeMessage } from '../server/mergeBot/signature.js';

export function gatekeeperKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  function line(kind, repo, number, sha) {
    const message = kind === 'revoke' ? revokeMessage(repo, number, sha) : clearMessage(repo, number, sha);
    const sig = sign(null, Buffer.from(message), privateKey).toString('base64');
    const verb = kind === 'revoke' ? 'gatekeeper-revoke' : 'gatekeeper-clear';
    return `${verb}: ${String(sha).toLowerCase()} pr=${number} sig=${sig}`;
  }
  return { pem, line };
}
