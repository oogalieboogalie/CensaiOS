// tests/dockerTailcat.test.js
//
// The Docker image carries tailcat for Friends. This reads the recipe: the
// program comes from its makers' release, at one pinned version, and is
// only kept when it matches the checksum written here.
import fs from 'node:fs';

const recipe = fs.readFileSync('Dockerfile', 'utf8');
const step = recipe.slice(recipe.indexOf('ARG TAILCAT_VERSION'), recipe.indexOf('ENV CENSAI_IN_CONTAINER'));

describe('tailcat in the Docker image', () => {
  test('comes from the tailscale/tailcat release for the pinned version', () => {
    expect(step).toMatch(/ARG TAILCAT_VERSION=\d+\.\d+\.\d+\n/);
    expect(step).toContain('https://github.com/tailscale/tailcat/releases/download/v${TAILCAT_VERSION}/tailcat_${TAILCAT_VERSION}_linux_${arch}.tar.gz');
  });

  test('is checked against a sha256 for each kind of computer before it is unpacked', () => {
    expect(step.match(/sum=[0-9a-f]{64} /g)).toHaveLength(2);
    expect(step.indexOf('sha256sum -c -')).toBeGreaterThan(step.indexOf('curl -fsSL'));
    expect(step.indexOf('tar -xzf')).toBeGreaterThan(step.indexOf('sha256sum -c -'));
    expect(step).toContain('set -e');
  });

  test('lands where censaiOS looks for it, in the image that runs (not the build stage)', () => {
    expect(step).toContain('--no-same-owner -C /usr/local/bin tailcat');
    expect(fs.readFileSync('server/friends/tailcat.js', 'utf8')).toContain("'/usr/local/bin/tailcat'");
    expect(recipe.indexOf('ARG TAILCAT_VERSION')).toBeGreaterThan(recipe.lastIndexOf('FROM node:22-alpine'));
  });

  test('is started once during the build, so an image whose tailcat cannot run is never made', () => {
    expect(step).toContain('tailcat genkey --client');
  });

  test('docker-compose.yml publishes the ports a friend\'s board opens on, to this computer only, under the numbers censaiOS is told', async () => {
    const compose = fs.readFileSync('docker-compose.yml', 'utf8');
    const told = /CENSAI_FRIENDS_JOIN_PORTS: "(\d+-\d+)"/.exec(compose)?.[1];
    expect(told).toBe('3031-3034');
    expect(compose).toContain(`- "127.0.0.1:${told}:${told}"`);
    const { joinPorts, MAX_JOINS } = await import('../server/friends/joins.js');
    expect(joinPorts({ CENSAI_IN_CONTAINER: '1', CENSAI_FRIENDS_JOIN_PORTS: told })).toHaveLength(MAX_JOINS);
  });
});
