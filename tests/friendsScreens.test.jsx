/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// tests/friendsScreens.test.jsx
//
// What a person sees of Friends: the card in Settings (the friend code, the
// one box that takes a friend's code or a party code, sharing the open board
// with one friend) and the sign-in screen a friend lands on after pasting a
// party code.
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.unstable_mockModule('../src/lib/store.js', () => ({
  useWorkspaceStore: (selector) => selector({ workspaceId: 'board-garden' }),
}));

const { FriendsSection } = await import('../src/components/theme/FriendsSection.jsx');
const { FriendEntry } = await import('../src/components/login/FriendEntry.jsx');
const { kindOfCode, mayNotOpenFriendBoards, openBoard } = await import('../src/lib/friends/index.js');

const MY_CODE = 'cf1-QWxtYQ-0a1b2c';
const SAMS_CODE = 'cf1-U2Ft-9f8e7d';
const PARTY_CODE = 'cp1-Z2FyZGVu-445566';
const SAM = { id: 'friend-sam', name: 'Sam', mark: 'ab12cd', party: null };
const PARTY = { id: 'party-1', friendId: 'friend-sam', friendName: 'Sam', boardId: 'board-garden', boardName: 'Garden plan', role: 'viewer', code: PARTY_CODE, startedAt: '2026-11-13T10:00:00.000Z', joined: false };
const CARD = { usable: true, on: true, tailcat: true, install: null, name: 'Alma', code: MY_CODE, friends: [], joins: [] };

let answers;
let calls;
// Lets the page finish reading its answer before the test looks at it.
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
function answer(path, body, status = 200) { answers[path] = { body, status }; }
const sent = (method) => calls.filter((call) => call.method === method);

beforeEach(() => {
  answers = {};
  calls = [];
  sessionStorage.clear();
  global.fetch = jest.fn(async (url, options = {}) => {
    const path = String(url).replace('/api/web-os/friends', '') || '/';
    calls.push({ path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined, token: options.headers?.['X-Party-Token'] });
    const found = answers[`${options.method || 'GET'} ${path}`] || answers[path] || { body: { error: 'Not found.' }, status: 404 };
    return { ok: found.status < 400, status: found.status, json: async () => found.body };
  });
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the Friends card in Settings', () => {
  test('shows your friend code and says nobody is on the list yet', async () => {
    answer('/', CARD);
    render(<FriendsSection />);
    expect(await screen.findByTestId('friend-code')).toHaveValue(MY_CODE);
    expect(screen.getByRole('switch', { name: 'Let friends join boards I share' })).toBeChecked();
    expect(screen.getByTestId('no-friends')).toBeInTheDocument();
    expect(screen.getByText(/holding it lets nobody in/)).toBeInTheDocument();
  });

  test('shows nothing to a teammate, or when opened from another computer', async () => {
    for (const [body, status] of [[{ usable: false }, 200], [{ error: 'Not found.' }, 404]]) {
      answer('/', body, status);
      const { container } = render(<FriendsSection />);
      await settle();
      expect(global.fetch).toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });

  test('when tailcat is missing it gives the one line to run, and nothing else to press', async () => {
    answer('/', { ...CARD, on: false, tailcat: false, code: '', install: { how: 'In PowerShell', line: 'scoop install tailcat' } });
    render(<FriendsSection />);
    expect(await screen.findByTestId('friends-needs-tailcat')).toHaveTextContent('scoop install tailcat');
    expect(screen.getByTestId('friends-needs-tailcat')).toHaveTextContent('In PowerShell, run this once');
    expect(screen.queryByRole('switch')).toBeNull();
    // After installing, "check again" finds it and the switch appears.
    answer('/', { ...CARD, on: false, code: '' });
    fireEvent.click(screen.getByRole('button', { name: /check again/ }));
    expect(await screen.findByRole('switch', { name: 'Let friends join boards I share' })).not.toBeChecked();
    expect(screen.queryByTestId('friend-code')).toBeNull();
  });

  test('turning it on asks the server, then shows the new friend code', async () => {
    answer('/', { ...CARD, on: false, code: '' });
    answer('PUT /', CARD);
    render(<FriendsSection />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Let friends join boards I share' }));
    expect(await screen.findByTestId('friend-code')).toHaveValue(MY_CODE);
    expect(sent('PUT')[0].body).toEqual({ on: true });
  });

  test('pasting a friend code adds that person and says they must add you too', async () => {
    answer('/', CARD);
    answer('POST /', { ...CARD, friends: [SAM], added: { name: 'Sam', alreadyThere: false } });
    render(<FriendsSection />);
    const box = await screen.findByLabelText('Paste a code');
    fireEvent.change(box, { target: { value: `  ${SAMS_CODE} ` } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByTestId('friend-row')).toHaveTextContent('Sam');
    expect(sent('POST')[0]).toMatchObject({ path: '/', body: { code: SAMS_CODE } });
    expect(screen.getByRole('status')).toHaveTextContent('You can share a board with them now.');
    expect(box).toHaveValue('');
  });

  const JOIN = { id: 'join-1', url: `http://p-0123456789ab.localhost:50123/?party=${'p'.repeat(32)}`, hostName: 'Sam', boardName: 'Trip ideas', startedAt: '2026-11-13T10:00:00.000Z' };

  test('a pasted party code joins the board instead, and opens it once the friend has answered', async () => {
    answer('/', CARD);
    answer('POST /joins', { ...CARD, joins: [JOIN], joined: JOIN });
    const openTab = jest.spyOn(window, 'open').mockReturnValue({});
    render(<FriendsSection />);
    fireEvent.change(await screen.findByLabelText('Paste a code'), { target: { value: PARTY_CODE } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Connected to Sam\'s board "Trip ideas". It is opening in your browser.');
    expect(sent('POST')[0]).toMatchObject({ path: '/joins', body: { code: PARTY_CODE } });
    expect(openTab).toHaveBeenCalledWith(JOIN.url, '_blank');
    expect(screen.getByTestId('joined-boards')).toHaveTextContent("Sam's board. You are there as yourself.");
  });

  test('when the browser stops the new tab, the card says where to press, and Open tries again', async () => {
    answer('/', CARD);
    answer('POST /joins', { ...CARD, joins: [JOIN], joined: JOIN });
    const openTab = jest.spyOn(window, 'open').mockReturnValue(null);
    render(<FriendsSection />);
    fireEvent.change(await screen.findByLabelText('Paste a code'), { target: { value: PARTY_CODE } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Press Open below to go there.');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow pop-ups');
    expect(openTab).toHaveBeenCalledTimes(2);
  });

  test('the installed app asks the computer to open its own browser', async () => {
    const invoke = jest.fn(async () => undefined);
    const openTab = jest.fn();
    expect(await openBoard(JOIN.url, { __TAURI_INTERNALS__: { invoke }, open: openTab })).toBe(true);
    expect(invoke).toHaveBeenCalledWith('open_in_system_browser', { url: JOIN.url });
    expect(openTab).not.toHaveBeenCalled();
    invoke.mockRejectedValueOnce(new Error('no browser'));
    expect(await openBoard(JOIN.url, { __TAURI_INTERNALS__: { invoke } })).toBe(false);
  });

  // A friend's board opens under a "….localhost" name, which Safari can't look up.
  const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
  const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';
  const APP_ON_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
  const APP_ON_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';

  test('knows when the browser that will open a friend\'s board may be Safari', () => {
    const browser = (userAgent) => ({ navigator: { userAgent } });
    const app = (userAgent) => ({ navigator: { userAgent }, __TAURI_INTERNALS__: {} });
    expect(mayNotOpenFriendBoards(browser(SAFARI))).toBe(true);
    for (const fine of [CHROME, EDGE, FIREFOX]) expect(mayNotOpenFriendBoards(browser(fine))).toBe(false);
    // The installed app opens the computer's own browser: Safari on a Mac unless changed.
    expect(mayNotOpenFriendBoards(app(APP_ON_MAC))).toBe(true);
    expect(mayNotOpenFriendBoards(app(APP_ON_WINDOWS))).toBe(false);
    expect(mayNotOpenFriendBoards({})).toBe(false);
  });

  test('in Safari the card says so and gives the address to paste into another browser', async () => {
    answer('/', { ...CARD, joins: [JOIN] });
    jest.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(SAFARI);
    const writeText = jest.fn(async () => undefined);
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      render(<FriendsSection />);
      expect(await screen.findByTestId('friends-safari-hint')).toHaveTextContent('paste it into Chrome, Edge or Firefox');
      fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith(JOIN.url);
    } finally {
      delete window.navigator.clipboard;
    }
  });

  test('in any other browser there is no such hint and no extra button', async () => {
    answer('/', { ...CARD, joins: [JOIN] });
    jest.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(CHROME);
    render(<FriendsSection />);
    expect(await screen.findByTestId('joined-boards')).toBeInTheDocument();
    expect(screen.queryByTestId('friends-safari-hint')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy address' })).toBeNull();
  });

  test('anything else in the box is refused before it is sent', async () => {
    answer('/', CARD);
    render(<FriendsSection />);
    fireEvent.change(await screen.findByLabelText('Paste a code'), { target: { value: 'hello there' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not a friend code or a party code');
    expect(sent('POST')).toHaveLength(0);
  });

  test('the server\'s own words show when a code is refused', async () => {
    answer('/', CARD);
    answer('POST /', { error: 'That is your own friend code. Ask your friend for theirs.', code: 'OWN_CODE' }, 409);
    render(<FriendsSection />);
    fireEvent.change(await screen.findByLabelText('Paste a code'), { target: { value: MY_CODE } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That is your own friend code.');
  });

  test('sharing the open board with one friend sends the board and what they can do, then shows their party code', async () => {
    answer('/', { ...CARD, friends: [SAM] });
    answer('POST /friend-sam/party', { ...CARD, friends: [{ ...SAM, party: PARTY }], party: PARTY });
    render(<FriendsSection />);
    fireEvent.change(await screen.findByLabelText('What Sam can do on this board'), { target: { value: 'viewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Share this board' }));
    expect(await screen.findByTestId('party-code')).toHaveValue(PARTY_CODE);
    expect(sent('POST')[0]).toMatchObject({ path: '/friend-sam/party', body: { workspaceId: 'board-garden', role: 'viewer' } });
    expect(screen.getByTestId('friend-row')).toHaveTextContent('Sharing "Garden plan" with Sam (can look)');
    expect(screen.getByTestId('friend-row')).toHaveTextContent("It only works on Sam's computer");
  });

  test('stop sharing ends that party, and the row says when the friend is in', async () => {
    answer('/', { ...CARD, friends: [{ ...SAM, party: { ...PARTY, joined: true } }] });
    answer('DELETE /party/party-1', { ...CARD, friends: [SAM] });
    render(<FriendsSection />);
    expect(await screen.findByTestId('friend-row')).toHaveTextContent('Sam is on "Garden plan" now');
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    await waitFor(() => expect(screen.queryByTestId('party-code')).toBeNull());
    expect(sent('DELETE')[0].path).toBe('/party/party-1');
    expect(screen.getByRole('status')).toHaveTextContent('the code no longer works');
  });

  test('removing a friend asks first, and does nothing on "Cancel"', async () => {
    answer('/', { ...CARD, friends: [SAM] });
    answer('DELETE /friend-sam', CARD);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<FriendsSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Sam' }));
    expect(confirm.mock.calls[0][0]).toContain('taken off every board');
    expect(sent('DELETE')).toHaveLength(0);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sam' }));
    expect(await screen.findByTestId('no-friends')).toBeInTheDocument();
    expect(sent('DELETE')[0].path).toBe('/friend-sam');
  });

  test('one box tells the two kinds of code apart by how they start', () => {
    expect(kindOfCode(` ${SAMS_CODE}`)).toBe('friend');
    expect(kindOfCode(PARTY_CODE)).toBe('party');
    expect(kindOfCode('tcSomethingElse')).toBe('');
  });
});

describe('the sign-in screen a friend lands on', () => {
  const HELLO = { app: 'censaiOS', host: 'Alma', friend: 'Sam', boardId: 'board-garden', boardName: 'Garden plan' };
  const PASSWORD = 'p'.repeat(32);
  const arrive = (search = `?party=${PASSWORD}`) => window.history.replaceState(null, '', `/${search}`);

  test('a page opened with a party code goes straight in, as the friend, on the shared board', async () => {
    arrive();
    answer('/party/hello', HELLO);
    answer('POST /party/enter', { ok: true, user: { id: 7, name: 'Sam' }, boardId: 'board-garden' });
    const onLoginSuccess = jest.fn();
    render(<FriendEntry onLoginSuccess={onLoginSuccess}><p>the usual sign-in</p></FriendEntry>);
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledTimes(1));
    // The password went along with both questions, and is out of the address.
    expect(calls.map((call) => call.token)).toEqual([PASSWORD, PASSWORD]);
    expect(window.location.search).toBe('?workspace=board-garden');
    expect(screen.queryByText('the usual sign-in')).toBeNull();
    expect(sent('POST')[0]).toMatchObject({ path: '/party/enter', body: {} });
  });

  test('any other page gets the usual sign-in, and nothing is sent', async () => {
    const onLoginSuccess = jest.fn();
    render(<FriendEntry onLoginSuccess={onLoginSuccess}><p>the usual sign-in</p></FriendEntry>);
    expect(await screen.findByText('the usual sign-in')).toBeInTheDocument();
    expect(sent('POST')).toHaveLength(0);
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  test('a shared board opened without its party code says how to open it, and offers no other way in', async () => {
    arrive('');
    answer('/party/hello', { app: 'censaiOS', needsCode: true });
    const onLoginSuccess = jest.fn();
    render(<FriendEntry onLoginSuccess={onLoginSuccess}><p>the usual sign-in</p></FriendEntry>);
    expect(await screen.findByRole('alert')).toHaveTextContent('it opens from their party code');
    expect(screen.getByTestId('friend-entry')).toHaveTextContent('Settings, Sharing, Friends');
    expect(screen.queryByText('the usual sign-in')).toBeNull();
    expect(sent('POST')).toHaveLength(0);
  });

  test('when sharing has stopped it says so, and never falls back to another way in', async () => {
    arrive();
    answer('/party/hello', HELLO);
    answer('POST /party/enter', { error: 'This board is not being shared with you right now.', partyEnded: true }, 403);
    const onLoginSuccess = jest.fn();
    render(<FriendEntry onLoginSuccess={onLoginSuccess}><p>the usual sign-in</p></FriendEntry>);
    expect(await screen.findByRole('alert')).toHaveTextContent('not being shared with you right now');
    expect(screen.getByTestId('friend-entry')).toHaveTextContent('Ask Alma to share it again');
    expect(screen.queryByText('the usual sign-in')).toBeNull();
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  test('after signing out in the same tab it offers a button instead of walking back in', async () => {
    // The tab kept the password from when it first came in; the address no longer has it.
    arrive('?workspace=board-garden');
    sessionStorage.setItem('homebase.friends.party.v1', PASSWORD);
    sessionStorage.setItem('homebase.friends.entered.v1', '1');
    answer('/party/hello', HELLO);
    answer('POST /party/enter', { ok: true, user: { id: 7, name: 'Sam' }, boardId: 'board-garden' });
    const onLoginSuccess = jest.fn();
    render(<FriendEntry onLoginSuccess={onLoginSuccess}><p>the usual sign-in</p></FriendEntry>);
    const back = await screen.findByRole('button', { name: 'Go back in' });
    expect(sent('POST')).toHaveLength(0);
    fireEvent.click(back);
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledTimes(1));
    expect(sent('POST')[0].token).toBe(PASSWORD);
  });
});
