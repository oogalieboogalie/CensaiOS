import express from 'express';
import { listRepos } from './repos.js';
import { getTree, browseDir } from './browser.js';
import { readFile, writeFile } from './content.js';
import { searchTree } from './search.js';
import { createIssue, listIssues, addLabels } from './issues.js';
import { listPulls, getPullDetails, mergePull } from './pulls.js';
import { resourceRateLimiter } from '../../middleware/standardRateLimits.js';

export const githubRouter = express.Router();
githubRouter.use(resourceRateLimiter);

githubRouter.get('/repos', listRepos);
githubRouter.get('/tree', getTree);
githubRouter.post('/write', writeFile);
githubRouter.get('/file', readFile);
githubRouter.post('/issues', createIssue);
githubRouter.get('/issues', listIssues);
githubRouter.post('/issues/labels', addLabels);
githubRouter.get('/pulls', listPulls);
githubRouter.get('/pulls/details', getPullDetails);
githubRouter.put('/pulls/merge', mergePull);
githubRouter.get('/browse', browseDir);
githubRouter.get('/search', searchTree);
