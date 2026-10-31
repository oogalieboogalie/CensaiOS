/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReviewPanel } from '../src/components/github/ReviewPanel.jsx';
import { HIDDEN_MARK, HIDDEN_WORDS } from '../shared/files/fileProblems.js';

// The GitHub window's review says why a finding shows [hidden]: a reviewer
// repeated a key from a file only this computer's owner opens. Made-up words.
const finding = { path: 'app.js', line: 2, severity: 'high', title: `app.js prints the key ${HIDDEN_MARK}`, explanation: 'It lands in every log.', reviewers: ['Claude Code'], notes: [] };
const job = (over) => ({
  id: 'made-up', status: 'done', text: '1 possible bug found.', posted: null,
  reviewers: [{ cli: 'claudecode', label: 'Claude Code', status: 'done', summary: `It prints ${HIDDEN_MARK}.` }],
  findings: [finding], ...over,
});
const team = { approve: () => {}, start: () => {}, postToGithub: () => {} };

describe('the review panel', () => {
  test('says what [hidden] stands for, and that GitHub gets it the same way', () => {
    render(<ReviewPanel number={7} roster={{ available: true, reviewers: [] }} state={{ open: true, job: job({ hiddenWords: true }) }} team={team} />);
    expect(screen.getByText(`app.js prints the key ${HIDDEN_MARK}`)).toBeInTheDocument();
    expect(screen.getByTestId('review-hidden-words')).toHaveTextContent(`${HIDDEN_WORDS} GitHub gets them the same way.`);
    expect(screen.getByRole('button', { name: 'Post to GitHub' })).toBeInTheDocument();
  });

  test('says nothing of it when no key was hidden', () => {
    render(<ReviewPanel number={7} roster={{ available: true, reviewers: [] }} state={{ open: true, job: job({ hiddenWords: false, findings: [{ ...finding, title: 'Off by one' }] }) }} team={team} />);
    expect(screen.getByText('Off by one')).toBeInTheDocument();
    expect(screen.queryByTestId('review-hidden-words')).not.toBeInTheDocument();
  });
});
