import express from 'express';
import { requireDb } from './shared.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';
import { BOARD_TEMPLATES, applyBoardTemplate } from '../../templates/index.js';
import { draftListing } from '../../realEstate/listingWriter.js';

// Spec 7: board templates ("Real Estate Team") and the Listing Writer.
export const boardTemplatesRouter = express.Router();

boardTemplatesRouter.get('/board-templates', (_req, res) => {
  res.json({ templates: BOARD_TEMPLATES });
});

// Create the template's agents on this board and return the board to lay out.
boardTemplatesRouter.post('/board-templates/:id/apply', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const board = await applyBoardTemplate(req.params.id, { scope, input: req.body || {} });
    res.json({ ok: true, board });
  } catch (err) {
    agentRouteError(res, err);
  }
});

// Listing Writer: a short form in, description + social post + email blast out.
boardTemplatesRouter.post('/real-estate/listing-draft', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const result = await draftListing({ scope, agentId: req.body?.agentId, listing: req.body?.listing || {} });
    res.json({ ok: true, ...result });
  } catch (err) {
    agentRouteError(res, err);
  }
});
