// Why a Kraken arm that was asked to FIX something cannot go out right now,
// in words for the person looking at the window: what is in the way, and what
// to try. The checks themselves are the ones Censai's chat runs before a
// hand-off (handOffGap, server/tools/handlers/censaiOrchestrator.js); their
// answers are written for Censai, so they are put in the person's words here.
//
// A blocked arm stays a fix. It is checked again on every look (the window
// looks every few seconds while a request is out), and goes out by itself once
// nothing is in the way. Stopping the request ends it.

import { agentName } from '../censaiOrchestrator/shape.js';

const AS_WRITEUP = 'Or stop this request and hand the report out again as a write-up.';

export const NOT_A_WORKER = Object.freeze({
  why: 'You can look at this board but not change its project.',
  fix: `Ask the board's owner to let you work on this board. ${AS_WRITEUP}`,
});

/**
 * A fix pinned to a folder on this computer: it is never written into the person's own
 * working folder, and a pull request needs a GitHub copy that is open on this board.
 * repo: the GitHub repo the folder is a checkout of, or null when it has none.
 */
export function noGithubCopy(pin, repo = null, { reachable = false } = {}) {
  const project = pin?.name ? `The project "${pin.name}"` : 'This project';
  if (!repo) {
    return {
      why: `${project} is a folder on this computer, and this folder has no GitHub copy to open a pull request on. A fix is never written straight into your own folder.`,
      fix: `Put the folder on GitHub, open that GitHub project in Projects, then look again and release. ${AS_WRITEUP}`,
    };
  }
  if (reachable) {
    return {
      why: `This fix was set up before fixes moved to GitHub branches, on the folder of ${repo} on this computer.`,
      fix: `Press "See who gets what" again and release it: it then goes to a branch and a pull request on ${repo}. ${AS_WRITEUP}`,
    };
  }
  return {
    why: `${project} is a folder on this computer. A fix goes to a pull request on its GitHub copy (${repo}), and that GitHub project is not open to you on this board.`,
    fix: `Open ${repo} in Projects, then press "See who gets what" again and release. ${AS_WRITEUP}`,
  };
}

/** A fix whose GitHub project the key it would use cannot read, branch or open a pull request in. */
export function accessWords(pin, reason) {
  return {
    why: String(reason || `GitHub did not say whether this work may open a pull request in ${pin?.source || 'the repo'}.`),
    fix: `Fix that on GitHub or in the GitHub window, and this goes out the next time you look. ${AS_WRITEUP}`,
  };
}

/** { why, fix } for one of handOffGap's answers ("Error: ..."), for the arm it was asked about. */
export function blockedWords(gap, arm, pin = null) {
  const said = String(gap || '').replace(/^Error:\s*/, '');
  const name = agentName(arm.agentId);
  const project = pin?.name ? `The project "${pin.name}"` : 'This project';
  if (/only this computer's owner/.test(said)) {
    return {
      why: 'Only this computer\'s owner can have code changed and tested here.',
      fix: `Ask this computer's owner to release the report. ${AS_WRITEUP}`,
    };
  }
  if (/lives on GitHub/.test(said)) {
    return {
      why: `${project} is only on GitHub: there is no folder of it on this computer, so a fix could not be tested.`,
      fix: `Open its folder on this computer in Projects, then look again and release. ${AS_WRITEUP}`,
    };
  }
  if (/no folder on this computer|could not find the project/.test(said)) {
    return {
      why: `${project} has no folder on this computer that its tests can run in.`,
      fix: `Open its folder on this computer in Projects, then look again and release. ${AS_WRITEUP}`,
    };
  }
  if (/Action Approvals/.test(said)) {
    return {
      why: `${name}'s file saves would wait for an OK each time: Trust mode is off for ${name}, or you are not this board's owner or admin.`,
      fix: `Turn on Trust mode for ${name}, and this goes out the next time you look. ${AS_WRITEUP}`,
    };
  }
  return {
    why: said.split(/(?<=[.!?])\s/)[0] || 'This could not be handed out here.',
    fix: `It is checked again each time you look. ${AS_WRITEUP}`,
  };
}
