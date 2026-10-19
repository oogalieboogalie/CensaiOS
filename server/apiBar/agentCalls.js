// server/apiBar/agentCalls.js
//
// Asking a shared agent through the bar uses the agent's own outside-door
// call path (server/agentEndpoints/callAgent.js): the same limits, the same
// signed receipt, and the exchange shows in the agent's chat on the board.
// The bar is not an agent key, so the call log records it without one.

import pool from '../db.js';
import * as endpointStore from '../agentEndpoints/store.js';
import { cleanQuestion, performOutsideCall } from '../agentEndpoints/callAgent.js';
import { endpointLimiter } from '../agentEndpoints/rateLimit.js';
import { runAgentForOutsideCall } from '../agentEndpoints/runAgent.js';
import { logOutsideCallOnBoard } from '../agentEndpoints/boardLog.js';
import { recordEndpointReceipt } from '../agentNetwork/endpointReceipt.js';

export function defaultAgentCalls() {
  return {
    cleanQuestion,
    performOutsideCall,
    deps: {
      db: pool,
      store: {
        ...endpointStore,
        touchToken: async () => {},
        logCall: (db, call) => endpointStore.logCall(db, { ...call, tokenId: null }),
      },
      limiter: endpointLimiter,
      runAgent: runAgentForOutsideCall,
      showOnBoard: logOutsideCallOnBoard,
      signReceipt: recordEndpointReceipt,
    },
  };
}
