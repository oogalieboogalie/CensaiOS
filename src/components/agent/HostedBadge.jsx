import React from 'react';
import { BrandIcon } from '../brand/BrandIcon.jsx';

// A hosted agent (Import → Hosted agent) lives on a vendor's platform. Its
// avatar carries that vendor's mark in a small corner badge so everyone on
// the board can tell where its answers come from.

export const HOSTED_BRAND = Object.freeze({
  anthropic: 'claude', openai: 'openai', google: 'googlecloud', elevenlabs: 'elevenlabs', langchain: 'langchain',
});

export function hostedVendorOf(agent) {
  const scopes = agent?.tool_scopes || agent?.toolScopes;
  const vendor = scopes?.hosted?.vendor;
  return HOSTED_BRAND[vendor] ? { vendor, label: scopes.hosted.label || vendor } : null;
}

export function HostedBadge({ agent, size }) {
  const hosted = hostedVendorOf(agent);
  if (!hosted || size < 22) return null;
  const badge = Math.max(12, Math.round(size * 0.42));
  return (
    <span className="hb-hosted-badge" style={{ width: badge, height: badge }} title={`Hosted on ${hosted.label}`} data-hosted-vendor={hosted.vendor}>
      <BrandIcon brand={HOSTED_BRAND[hosted.vendor]} size={Math.round(badge * 0.72)} title="" />
    </span>
  );
}
