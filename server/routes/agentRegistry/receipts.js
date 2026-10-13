// Agent Registry — receipts for help requests (server/agentNetwork).
//   GET /receipts?workspaceId&limit   this workspace's signed receipts, newest
//                                     first, each checked again on the way out,
//                                     plus this install's id and public key
// The router-level requireActor guard has already run.

import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { listReceipts } from '../../agentNetwork/receiptStore.js';
import { getInstallSigner } from '../../agentNetwork/installIdentity.js';

export async function listAgentReceipts(req, res) {
  try {
    const workspaceId = String(req.query?.workspaceId || '').trim();
    if (!workspaceId) return res.status(400).json({ error: 'Open a workspace to see receipts.' });
    await requireWorkspaceMember(pool, { workspaceId, userId: Number(req.agentActor.id) });
    const [receipts, signer] = await Promise.all([
      listReceipts(pool, { workspaceId, limit: req.query?.limit }),
      getInstallSigner(pool),
    ]);
    return res.json({ workspaceId, install: { id: signer.installId, publicKey: signer.publicKey }, receipts });
  } catch (error) {
    const status = Number(error?.statusCode);
    if (status >= 400 && status < 500) return res.status(status).json({ error: error.message });
    return res.status(500).json({ error: 'Receipts are temporarily unavailable.' });
  }
}
