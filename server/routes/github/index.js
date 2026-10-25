import express from 'express';
import { listRepos } from './repos.js';
import { getTree, browseDir } from './browser.js';
import { readFile, writeFile } from './content.js';
import { searchTree } from './search.js';
import { createIssue, listIssues, addLabels } from './issues.js';
import { listPulls, getPullDetails, mergePull } from './pulls.js';
import { mergeDeskRouter } from './mergeDesk.js';
import { reviewTeamRouter } from './reviewTeam.js';
import { resourceRateLimiter } from '../../middleware/standardRateLimits.js';
import { githubToken } from '../../github/writeToken.js';

export const githubRouter = express.Router();
githubRouter.use(resourceRateLimiter);

// The person's own GitHub key first. Looking may fall back to the owner's
// GITHUB_TOKEN for anyone signed in; changing something with it is the
// owner's alone (server/github/writeToken.js).
const read = githubToken();
const write = (feature) => githubToken({ write: feature });

githubRouter.get('/repos', read, listRepos);
githubRouter.get('/tree', read, getTree);
githubRouter.post('/write', write('github write file'), writeFile);
githubRouter.get('/file', read, readFile);
githubRouter.post('/issues', write('github new issue'), createIssue);
githubRouter.get('/issues', read, listIssues);
githubRouter.post('/issues/labels', write('github issue labels'), addLabels);
githubRouter.get('/pulls', read, listPulls);
githubRouter.get('/pulls/details', read, getPullDetails);
githubRouter.put('/pulls/merge', write('github merge'), mergePull);
githubRouter.get('/browse', read, browseDir);
githubRouter.get('/search', read, searchTree);
githubRouter.use(mergeDeskRouter);
githubRouter.use(reviewTeamRouter);
