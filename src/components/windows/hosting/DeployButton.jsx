/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { deployLink, githubRepoUrl, hasDeployButton } from '../../../lib/hosting/deployLinks.js';

/**
 * The deploy row under a place's steps: which GitHub copy to use, a plain
 * sentence of what the button will do, then the button. The button only
 * opens that service's page; the deploy itself happens there, after you
 * sign in and confirm.
 */
export function DeployButton({ targetId, repo, onRepo }) {
  if (!hasDeployButton(targetId)) return null;
  const link = deployLink(targetId, repo);
  const typedBad = Boolean(String(repo || '').trim()) && !githubRepoUrl(repo);
  const hint = typedBad
    ? 'Type it as owner/repo, or paste the github.com address.'
    : 'Type your censaiOS copy to get the deploy button.';

  return (
    <div className="hb-host-deploy" data-testid="host-deploy">
      <label className="hb-host-deploy-label">
        Your censaiOS copy on GitHub
        <input
          className="hb-host-input"
          value={repo}
          placeholder="owner/repo"
          aria-label="Your GitHub repo"
          spellCheck={false}
          onChange={(event) => onRepo(event.target.value)}
        />
      </label>
      {link ? (
        <>
          <p className="hb-host-deploy-says" data-testid="host-deploy-says">{link.says}</p>
          <a className="hb-host-btn hb-host-btn-primary" href={link.href} target="_blank" rel="noopener noreferrer">
            <Icon.Send size={12} /> {link.label}
          </a>
        </>
      ) : (
        <p className="hb-host-where">{hint}</p>
      )}
    </div>
  );
}
