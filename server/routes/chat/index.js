import express from 'express';
import { handleImageGen, handleIdeaExpand, handleGroupChat } from './handlers.js';
import { handleChat } from './main.js';

// Re-export for taskWorker.js and other consumers
export { buildSubAgentSystemPrompt, getSubAgentModelConfig } from './prompts.js';
export { fetchChatCompletion } from './shared.js';

export const chatRouter = express.Router();

chatRouter.post('/image', handleImageGen);
chatRouter.post('/ideas/expand', handleIdeaExpand);
chatRouter.post('/chat', handleChat);
chatRouter.post('/group-chat', handleGroupChat);
