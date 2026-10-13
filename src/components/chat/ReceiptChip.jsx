/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { receiptLine } from '../../lib/agentNetwork/receiptText.js';

/**
 * The signed receipt under an answer one agent gave another (agent network).
 * Full receipts live in the Agent Registry's Receipts tab.
 */
export function ReceiptChip({ receipt }) {
  if (!receipt) return null;
  return (
    <div className="hb-msg-receipt" data-testid="chat-receipt" data-verified={receipt.verified ? 'true' : 'false'}
      title={`Receipt ${receipt.id}. Open the Agent Registry, Receipts, to see it in full.`}>
      <span className="hb-msg-receipt-dot" aria-hidden="true" />
      {receiptLine(receipt)}
    </div>
  );
}
