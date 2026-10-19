import express from 'express';
import { requireLocalFilesystem } from '../../middleware/runtimeMode.js';
import { requireSystemAdmin } from '../../security/systemAdmin.js';
import { 
  getCurrentProject, listAllProjects, updateCurrentProject, openProjectHandler,
  listOpenProjectsHandler,
} from './core.js';
import { createProjectIdea } from './ideas.js';
import { createProjectHandoff } from './creation.js';
import { projectMembershipsRouter } from './memberships.js';

export const projectsRouter = express.Router();

projectsRouter.get('/current-project', getCurrentProject);
projectsRouter.get('/projects', listAllProjects);
projectsRouter.get('/open-projects', requireLocalFilesystem, listOpenProjectsHandler);

projectsRouter.put('/current-project', requireLocalFilesystem, requireSystemAdmin, updateCurrentProject);
projectsRouter.post('/projects/open', requireLocalFilesystem, requireSystemAdmin, openProjectHandler);

projectsRouter.post('/project-ideas', requireLocalFilesystem, requireSystemAdmin, createProjectIdea);
projectsRouter.post('/project-handoffs', requireLocalFilesystem, requireSystemAdmin, createProjectHandoff);

projectsRouter.use(projectMembershipsRouter);
