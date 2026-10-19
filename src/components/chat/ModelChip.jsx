/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { MODEL_OPTIONS } from '../../lib/agentModelOptions.js';
import { BrandIcon } from '../brand/BrandIcon.jsx';
import { PROVIDER_BRAND } from '../../lib/brands/index.js';
import { describeCapabilities, getModelCapabilities } from '../../lib/chat/modelCapabilities.js';
import { useEscapeDismiss, useOutsideDismiss } from '../../lib/useEscapeDismiss.js';
import { StrengthsMenuItem } from './StrengthsMenuItem.jsx';

const PROVIDER_LABELS = {
  openai: 'OpenAI', openrouter: 'OpenRouter', google: 'Google', cohere: 'Cohere',
  ollama: 'Ollama', moonshot: 'Moonshot', opencode: 'OpenCode Zen', anthropic: 'Anthropic',
};

const DICTATION_KEY_NAMES = { openai: 'OpenAI', google: 'Google' };
// Claude and Grok dictate with the person's OpenAI or Google key.
const dictationTitle = (provider) => (DICTATION_KEY_NAMES[provider] ? `Dictation (your ${DICTATION_KEY_NAMES[provider]} key)` : 'Dictation');

/** Small icons for what a model takes in beyond text. Only supported ones show. */
export function CapabilityIcons({ caps }) {
  if (!caps) return null;
  const icons = [
    caps.image ? ['image', Icon.Picture, 'Images'] : null,
    caps.pdf ? ['pdf', Icon.Files, 'PDFs'] : null,
    caps.video ? ['video', Icon.Video, 'Video'] : null,
    caps.voiceInput ? ['voice', Icon.Mic, caps.voiceInput === 'native' ? 'Hears voice' : dictationTitle(caps.dictationProvider)] : null,
    caps.voiceOutput ? ['speak', Icon.Speaker, 'Reads replies aloud'] : null,
    caps.tools ? ['tools', Icon.Tools, 'Uses tools'] : null,
  ].filter(Boolean);
  if (icons.length === 0) return null;
  return (
    <span className="hb-caps" aria-hidden="true">
      {icons.map(([key, Glyph, title]) => <span key={key} title={title} data-cap={key}><Glyph size={11} /></span>)}
    </span>
  );
}

/**
 * The model chip in the composer (spec 3): the model's name and what it can
 * take in. Clicking it lists the models this agent can switch to; `onSelect`
 * saves the choice. Without `onSelect` it is a read-only label. With `auto`
 * ({ on, toggle }) the menu starts with the Auto-pick by strengths switch.
 */
export function ModelChip({ capabilities, provider, onSelect, status, auto }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  useEscapeDismiss(open, () => setOpen(false));
  useOutsideDismiss(open, ref, () => setOpen(false));
  if (!capabilities?.model) return null;
  const supported = describeCapabilities(capabilities);
  const summary = supported.length ? supported.join(' · ') : 'text only';
  const current = capabilities.model;
  // Built-in agents may not name a provider; find it from the current model.
  const home = provider && MODEL_OPTIONS[provider]
    ? provider
    : Object.keys(MODEL_OPTIONS).find(p => MODEL_OPTIONS[p].some(o => o.value === current)) || null;
  const providers = home ? [home] : [];
  const others = Object.keys(MODEL_OPTIONS).filter(p => !providers.includes(p));

  const pick = (p, value) => {
    setOpen(false);
    if (p !== home || value !== current) onSelect?.(p, value);
  };

  return (
    <div className="hb-model" ref={ref}>
      <button type="button" className="hb-model-chip" data-testid="chat-capabilities"
        aria-haspopup={onSelect ? 'menu' : undefined} aria-expanded={onSelect ? open : undefined}
        title={`${current}: ${summary}${onSelect ? '. Click to switch model.' : ''}`}
        data-auto={auto?.on ? 'true' : undefined}
        onClick={() => onSelect && setOpen(o => !o)} style={onSelect ? undefined : { cursor: 'default' }}>
        <span className="hb-model-name">{current}</span>
        <span className="hb-sr-only"> · {summary}</span>
        <CapabilityIcons caps={capabilities} />
        {onSelect && <Icon.Chevron size={11} style={{ transform: 'rotate(90deg)' }} />}
      </button>
      {open && (
        <div className="hb-model-menu" role="menu" aria-label="Switch model">
          {status && <div className="hb-model-status">{status}</div>}
          {auto && <StrengthsMenuItem on={auto.on} onToggle={(value) => { setOpen(false); auto.toggle(value); }} />}
          {[...providers, ...others].map(p => (
            <React.Fragment key={p}>
              <div className="hb-model-group"><BrandIcon brand={PROVIDER_BRAND[p]} size={12} title="" />{PROVIDER_LABELS[p] || p}</div>
              {MODEL_OPTIONS[p].map(opt => {
                const checked = p === home && opt.value === current;
                return (
                  <button key={opt.value} type="button" role="menuitemradio" aria-checked={checked}
                    className="hb-model-item" onClick={() => pick(p, opt.value)} title={opt.label}>
                    <span>{opt.value}</span>
                    <CapabilityIcons caps={getModelCapabilities(p, opt.value)} />
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
