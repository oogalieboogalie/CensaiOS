/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { SpotifyWindow } from '../src/components/SpotifyWindow.jsx';
import { parseSpotifyEmbedUrl } from '../src/components/spotify/spotifyEmbed.js';

describe('Spotify embeds', () => {
  test('normalizes supported Spotify URLs and URIs to embed URLs', () => {
    expect(parseSpotifyEmbedUrl('https://open.spotify.com/track/abc123?si=share')).toBe(
      'https://open.spotify.com/embed/track/abc123'
    );
    expect(parseSpotifyEmbedUrl('https://open.spotify.com/intl-en/playlist/37i9dQZF1DWWQRwui0ExPn')).toBe(
      'https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn'
    );
    expect(parseSpotifyEmbedUrl('spotify:album:1ATL5GLyefJaxhQzSPVrLX')).toBe(
      'https://open.spotify.com/embed/album/1ATL5GLyefJaxhQzSPVrLX'
    );
  });

  test('rejects non-Spotify and unsupported Spotify paths', () => {
    expect(parseSpotifyEmbedUrl('https://example.com/track/abc123')).toBeNull();
    expect(parseSpotifyEmbedUrl('https://open.spotify.com/search/focus')).toBeNull();
    expect(parseSpotifyEmbedUrl('spotify:user:someone')).toBeNull();
  });

  test('preset button stores the embeddable player URL on the window', () => {
    const onUpdate = jest.fn();

    render(React.createElement(SpotifyWindow, { win: { id: 'spotify-test' }, onUpdate }));
    fireEvent.click(screen.getByText('Lofi Beats'));

    expect(onUpdate).toHaveBeenCalledWith({
      url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn',
      spotifyTitle: 'Lofi Beats',
    });
  });
});
