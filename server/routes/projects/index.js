import express from 'express';
import { requireLocalFilesystem } from '../../middleware/runtimeMode.js';
import { 
  getCurrentProject, listAllProjects, updateCurrentProject, openProjectHandler 
} from './core.js';
import { createProjectIdea } from './ideas.js';
import { createProjectHandoff } from './creation.js';
import { projectMembershipsRouter } from './memberships.js';

export const projectsRouter = express.Router();

projectsRouter.get('/current-project', getCurrentProject);
projectsRouter.get('/projects', listAllProjects);

projectsRouter.put('/current-project', requireLocalFilesystem, updateCurrentProject);
projectsRouter.post('/projects/open', requireLocalFilesystem, openProjectHandler);

projectsRouter.post('/project-ideas', requireLocalFilesystem, createProjectIdea);
projectsRouter.post('/project-handoffs', requireLocalFilesystem, createProjectHandoff);

projectsRouter.use(projectMembershipsRouter);
