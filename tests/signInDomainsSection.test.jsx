/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const getSignInDomains = jest.fn();
const addSignInDomain = jest.fn();
const removeSignInDomain = jest.fn();

jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: { getSignInDomains, addSignInDomain, removeSignInDomain },
}));

const { SignInDomainsSection } = await import('../src/components/theme/SignInDomainsSection.jsx');

const settingsFile = { allowedUsers: ['owner@censai.app'], adminEmails: ['owner@censai.app'], openToEveryone: false };

describe('Who can sign up', () => {
  afterEach(cleanup);
  beforeEach(() => {
    jest.clearAllMocks();
    getSignInDomains.mockResolvedValue({ domains: [], settingsFile });
  });

  test('is not shown to someone who is not an admin', () => {
    const { container } = render(<SignInDomainsSection isAdmin={false} />);
    expect(container.textContent).toBe('');
    expect(getSignInDomains).not.toHaveBeenCalled();
  });

  test('an admin adds a domain and sees it listed', async () => {
    addSignInDomain.mockResolvedValue({ domain: 'censai.app', domains: [{ domain: 'censai.app' }], settingsFile });
    render(<SignInDomainsSection isAdmin />);
    expect(await screen.findByText('No domains yet.')).toBeTruthy();
    expect(screen.getByText(/owner@censai\.app/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Domain, for example censai.app'), { target: { value: 'censai.app' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add domain' }));

    await waitFor(() => expect(addSignInDomain).toHaveBeenCalledWith('censai.app'));
    expect(await screen.findByText('@censai.app')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/@censai\.app email can sign up now/);
  });

  test('removing a domain and a refused domain both say what happened', async () => {
    getSignInDomains.mockResolvedValue({ domains: [{ domain: 'censai.app' }], settingsFile });
    removeSignInDomain.mockResolvedValue({ removed: true, domains: [], settingsFile });
    addSignInDomain.mockRejectedValue(new Error('Anyone can get an @gmail.com address, so it would let everyone sign up.'));
    render(<SignInDomainsSection isAdmin />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove @censai.app' }));
    await waitFor(() => expect(removeSignInDomain).toHaveBeenCalledWith('censai.app'));
    expect(await screen.findByText('No domains yet.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Domain, for example censai.app'), { target: { value: 'gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add domain' }));
    expect(await screen.findByText(/let everyone sign up/)).toBeTruthy();
  });

  test('says so when the list would change nothing yet', async () => {
    getSignInDomains.mockResolvedValue({ domains: [], settingsFile: { allowedUsers: [], adminEmails: [], openToEveryone: true } });
    render(<SignInDomainsSection isAdmin />);
    expect(await screen.findByRole('note')).toBeTruthy();
  });
});
