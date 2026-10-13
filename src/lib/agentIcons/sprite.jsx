// <AgentIcon /> — the React surface for the icon registry.
//
// Renders an icon as inline SVG, sized via CSS, colored via currentColor so
// it picks up theme tokens from the parent. Three ways to address an icon:
//
//   1. By agent:    <AgentIcon agent={agent} size={28} />
//   2. By kind+id:  <AgentIcon kind="stock" id="circle" size={24} />
//   3. By ref:      <AgentIcon id="stock:orbit" size={24} />
//
// All three routes flow through resolveIcon() so the lookup semantics stay
// in one place. The component renders nothing (null) when nothing resolves —
// callers fall back to the legacy AgentVectorIcon or emoji as appropriate.
//
// The SVG markup is inlined via dangerouslySetInnerHTML on a sized span so
// the inner <svg> adopts the wrapper's currentColor and dimensions. This
// avoids re-parsing the markup at runtime and keeps the registry the single
// source of truth for the actual glyph data.

import React, { forwardRef } from 'react';
import { AGENT_ICONS, STOCK_ICONS, resolveIcon, hasVectorIcon } from './registry.js';

const AgentIcon = forwardRef(function AgentIcon(props, ref) {
  const {
    kind,
    id,
    agent,
    size = 24,
    color,           // alias for stroke; default inherits via currentColor
    strokeWidth,     // override; default 2 (matches asset default)
    className,
    style,
    title,           // optional accessible label
    'aria-label': ariaLabel,
    role = 'img',
    ...rest
  } = props;

  // Resolve the entry. Three routes, registry is canonical.
  let entry = null;
  if (agent) {
    entry = resolveIcon({ agent });
  } else if (kind === 'agent' && id) {
    entry = AGENT_ICONS[id] || null;
  } else if (kind === 'stock' && id) {
    entry = STOCK_ICONS[id] || null;
  } else if (typeof id === 'string' && id.length > 0) {
    entry = resolveIcon(id);
  }

  if (!entry) return null;

  // Compute the wrapper dimensions. We use a span (inline-flex) so the
  // inner SVG fills the box via 100% sizing in our injected style.
  const dim = `${size}px`;
  const wrapperStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: dim,
    height: dim,
    flexShrink: 0,
    color: color || 'currentColor',
    lineHeight: 0,        // prevents baseline gaps inside inline layouts
    ...style,
  };

  // We need to optionally override strokeWidth. The registry validates the
  // markup has stroke-width="2" baked in. To make the override visible, we
  // post-process the markup by injecting an inline style on the root <svg>
  // when strokeWidth differs from the default.
  let markup = entry.markup;
  if (strokeWidth != null && strokeWidth !== 2) {
    markup = markup.replace(
      /<svg\b/i,
      `<svg style="stroke-width:${strokeWidth}"`,
    );
  }

  const a11y = {};
  if (ariaLabel || title) a11y['aria-label'] = ariaLabel || title;
  if (title) a11y['title'] = title;
  if (!a11y['aria-label']) a11y['aria-hidden'] = 'true';

  return (
    <span
      ref={ref}
      className={`agent-icon agent-icon--${entry.kind} ${className || ''}`.trim()}
      style={wrapperStyle}
      role={role}
      {...a11y}
      {...rest}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
});

export default AgentIcon;
export { AgentIcon };