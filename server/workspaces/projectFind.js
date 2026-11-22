// Finding a project row: for opening one (is this repo or folder already
// here?) and for an agent that names one. What makes two projects the same
// one is in ./projectIdentity.js.

import pool from '../db.js';
import { normalizeProjectPathForStorage } from './shared.js';
import { folderSourceKey, oneProjectOrChoice, pickProjectFor, repoSourceKey } from './projectIdentity.js';

// One folder, however its slashes and (on a drive letter) its capitals are written.
export const sameFolder = (a, b) => `(${a} = ${b} OR (${b} ~* '^[a-z]:' AND lower(replace(${a}, chr(92), '/')) = lower(replace(${b}, chr(92), '/'))))`;
const MOST_MATCHES = 50;

/** The row for this GitHub repo (owner/name), or null. GitHub reads capitals as the same repo. */
export async function findExistingGithubProject(repo) {
  const { rows } = await pool.query(
    `SELECT * FROM projects
     WHERE lower(repo) = lower($1)
     ORDER BY CASE WHEN repo = $1 THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 1`,
    [repo]
  );
  return rows[0] || null;
}

/**
 * The row for this folder, or null. Only the folder decides: another project
 * that happens to have the same name is another project. A folder-only row
 * comes first; then a row that has this folder and a repo as well (an older
 * version could merge the two, and boards, helpers and tasks hold that row's
 * id, so the folder keeps opening it rather than a new row). A row from long
 * ago with neither a repo nor a folder is taken up by its name, since it
 * points nowhere yet.
 */
export async function findExistingLocalProject(name, projectPath) {
  const absPath = projectPath ? normalizeProjectPathForStorage(projectPath) : null;
  const { rows } = await pool.query(
    `SELECT * FROM projects
     WHERE ($1::text IS NOT NULL AND ${sameFolder('path', '$1')})
        OR (COALESCE(path, '') = '' AND COALESCE(repo, '') = '' AND lower(name) = lower($2))
     ORDER BY
       CASE WHEN COALESCE(path, '') = '' THEN 2 WHEN COALESCE(repo, '') = '' THEN 0 ELSE 1 END,
       CASE WHEN owner_agent_id = 'shared' THEN 0 ELSE 1 END,
       updated_at DESC
     LIMIT ${MOST_MATCHES}`,
    [absPath, name]
  );
  const wanted = folderSourceKey(absPath);
  return rows.find((row) => !row.path || folderSourceKey(row.path) === wanted) || null;
}

/**
 * The project with this name. Several rows for one repo or one folder are one
 * project (the asking agent's row first, then the newest). Different projects
 * with the same name are a choice: the refusal names them, so nobody is sent
 * to work in the wrong one. `sameRepoAs` (an "owner/name" someone typed) leaves
 * out a GitHub project that is some other repo.
 */
export async function getProjectByName(ownerAgentId, name, { sameRepoAs = null } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM projects
     WHERE lower(name) = lower($2)
     ORDER BY
       CASE WHEN owner_agent_id = $1 THEN 0 ELSE 1 END,
       updated_at DESC
     LIMIT ${MOST_MATCHES}`,
    [ownerAgentId, name]
  );
  const wanted = sameRepoAs ? repoSourceKey(sameRepoAs) : '';
  const fits = wanted ? rows.filter((row) => !row.repo || repoSourceKey(row.repo) === wanted) : rows;
  return oneProjectOrChoice(fits, sameRepoAs || name);
}

/**
 * The project with this full repo (owner/name) or this folder. A bare name
 * also finds the repo that ends in it (acme/shop for "shop"); when two repos
 * do, the refusal names them rather than picking the newer one.
 */
export async function getProjectByRepoOrPath(ownerAgentId, value) {
  const { rows } = await pool.query(
    `SELECT * FROM projects
     WHERE (repo = $2 OR lower(repo) = lower($2))
        OR ($2 NOT LIKE '%/%' AND lower(regexp_replace(repo, '^.*/', '')) = lower($2))
        OR ${sameFolder('path', '$2')}
     ORDER BY
       CASE WHEN owner_agent_id = $1 THEN 0 ELSE 1 END,
       updated_at DESC
     LIMIT ${MOST_MATCHES}`,
    [ownerAgentId, value]
  );
  return pickProjectFor(rows, value);
}
