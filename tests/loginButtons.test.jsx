/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Login } from '../src/components/Login.jsx';

// Every button on the sign-in screen does something: no dead footer links,
// no "not configured" pop-ups for sign-in ways that do not exist.

test.each([
  ['Privacy', 'Privacy and data flow'],
  ['Terms', 'Terms'],
  ['Help', 'Help'],
])('footer %s opens its dialog and closes again', (label, title) => {
  render(<Login oauthConfigured={false} onLoginSuccess={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(screen.getByRole('dialog')).toHaveAccessibleName(title);
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('Escape closes a footer dialog', () => {
  render(<Login oauthConfigured={false} onLoginSuccess={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Help' }));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('without Google set up, only the email form shows', () => {
  render(<Login oauthConfigured={false} onLoginSuccess={() => {}} />);
  expect(screen.queryByText(/Continue with Google/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Continue with GitHub/)).not.toBeInTheDocument();
  expect(screen.queryByText(/passkey/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enter Canvas' })).toBeInTheDocument();
});

test('with Google set up, Google and email are the two ways in', () => {
  render(<Login oauthConfigured onLoginSuccess={() => {}} />);
  expect(screen.getByText('Continue with Google').closest('a')).toHaveAttribute('href', '/api/auth/google');
  expect(screen.queryByRole('button', { name: 'Enter Canvas' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));
  expect(screen.getByRole('button', { name: 'Enter Canvas' })).toBeInTheDocument();
});
