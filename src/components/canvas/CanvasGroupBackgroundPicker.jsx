import React from 'react';

function channelToHex(value) {
  return Math.round(value * 255).toString(16).padStart(2, '0');
}

function hueToHex(hue) {
  const saturation = 0.35;
  const lightness = 0.9;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = (((hue % 360) + 360) % 360) / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1 ? [chroma, secondary, 0]
    : segment < 2 ? [secondary, chroma, 0]
      : segment < 3 ? [0, chroma, secondary]
        : segment < 4 ? [0, secondary, chroma]
          : segment < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return `#${channelToHex(red + match)}${channelToHex(green + match)}${channelToHex(blue + match)}`;
}

export function CanvasGroupBackgroundPicker({ color, hue, onChange }) {
  return (
    <input
      type="color"
      aria-label="Group background color"
      title="Choose group background color"
      value={color || hueToHex(hue)}
      onChange={(event) => onChange(event.target.value)}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        width: 18,
        height: 18,
        padding: 0,
        border: '1px solid rgba(255,255,255,0.65)',
        borderRadius: 5,
        background: 'transparent',
        cursor: 'pointer',
      }}
    />
  );
}
