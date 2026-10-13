import { Router } from 'express';
import { coreRouter } from './core.js';
import { executionRouter } from './execution.js';

export const vexRouter = Router();

vexRouter.use(coreRouter);
vexRouter.use(executionRouter);
