/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars */
/**
 * tests/agentIconPicker.test.jsx
 *
 * Brief C2 — `.team/handoffs/2026-06-23-c2-agent-icon-picker.md`.
 *
 * Mount tests for the AgentIconPicker component:
 *   1. Renders all three tabs.
 *   2. Built-in tab shows the family + stock icons from C1's registry.
 *   3. Selecting a built-in icon calls onChange with the icon id.
 *   4. Upload tab accepts a valid SVG and rejects dangerous ones.
 *   5. Generate tab is disabled on explicit opt-out.
 *   6. Generate tab calls generateAgentIcon otherwise;
 *      raster fallbacks are rejected.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { AgentIconPicker } from '../src/components/agent/AgentIconPicker.jsx';
import {
  isGenerateEnabled,
  setIconGatewayCaller,
  resetIconGatewayCaller,
} from '../src/lib/agentIcons/generate.js';

const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="currentColor"/></svg>';
const RASTER_FALLBACK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" width="64" height="64"/></svg>';

describe('Brief C2 - AgentIconPicker panel', () => {
  beforeEach(() => {
    // Default: no explicit flag (UI offered; server enforces cost).
    delete process.env.CENSAAI_AGENT_ICON_GENERATOR;
    resetIconGatewayCaller();
  });

  test('renders all three tabs', () => {
    render(<AgentIconPicker value={null} onChange={() => {}} />);
    expect(screen.getByTestId('icon-picker-tab-built-in')).toBeTruthy();
    expect(screen.getByTestId('icon-picker-tab-upload')).toBeTruthy();
    expect(screen.getByTestId('icon-picker-tab-generate')).toBeTruthy();
  });

  test('built-in tab shows family + stock icons from C1', () => {
    render(<AgentIconPicker value={null} onChange={() => {}} />);
    // 7 family icons (architect, atlas, genesis, nexus, foundation, echo, censai).
    expect(screen.getByTestId('icon-picker-family-architect')).toBeTruthy();
    expect(screen.getByTestId('icon-picker-family-atlas')).toBeTruthy();
    expect(screen.getByTestId('icon-picker-family-censai')).toBeTruthy();
    // 12 stock icons (sample).
    expect(screen.getByTestId('icon-picker-stock-circle')).toBeTruthy();
    expect(screen.getByTestId('icon-picker-stock-triangle')).toBeTruthy();
  });

  test('selecting a family icon calls onChange with the id', () => {
    const onChange = jest.fn();
    render(<AgentIconPicker value={null} onChange={onChange} />);
    act(() => {
      fireEvent.click(screen.getByTestId('icon-picker-family-architect'));
    });
    expect(onChange).toHaveBeenCalledWith('architect');
  });

  test('selecting a stock icon calls onChange with the id', () => {
    const onChange = jest.fn();
    render(<AgentIconPicker value={null} onChange={onChange} />);
    act(() => {
      fireEvent.click(screen.getByTestId('icon-picker-stock-circle'));
    });
    expect(onChange).toHaveBeenCalledWith('circle');
  });

  test('upload tab: valid SVG sanitizes and emits the sanitized source', async () => {
    const onChange = jest.fn();
    render(<AgentIconPicker value={null} onChange={onChange} />);
    act(() => {
      fireEvent.click(screen.getByTestId('icon-picker-tab-upload'));
    });
    const file = { name: 'test.svg', size: VALID_SVG.length, text: async () => VALID_SVG };
    const input = screen.getByTestId('icon-picker-upload-input');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toContain('<svg');
    expect(onChange.mock.calls[0][0]).toContain('viewBox');
  });

  test('upload tab: SVG with <script> is rejected with a clear error', async () => {
    const onChange = jest.fn();
    render(<AgentIconPicker value={null} onChange={onChange} />);
    act(() => {
      fireEvent.click(screen.getByTestId('icon-picker-tab-upload'));
    });
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><script>alert(1)</script></svg>';
    const file = { name: 'evil.svg', size: evil.length, text: async () => evil };
    const input = screen.getByTestId('icon-picker-upload-input');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('icon-picker-error').textContent).toMatch(/<script>/i);
  });

  test('upload tab: oversize file is rejected', async () => {
    const onChange = jest.fn();
    render(<AgentIconPicker value={null} onChange={onChange} />);
    act(() => {
      fireEvent.click(screen.getByTestId('icon-picker-tab-upload'));
    });
    const big = VALID_SVG + '<!-- padding to push past 50 KB -->' + 'x'.repeat(60 * 1024);
    const file = { name: 'big.svg', size: big.length, text: async () => big };
    const input = screen.getByTestId('icon-picker-upload-input');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('icon-picker-error').textContent).toMatch(/too large/i);
  });

  test('generate tab: explicit opt-out shows a disabled message', () => {
    process.env.CENSAAI_AGENT_ICON_GENERATOR = '0';
    expect(isGenerateEnabled()).toBe(false);
    render(<AgentIconPicker value={null} onChange={() => {}} />);
    act(() => {
      fireEvent.click(screen.getByTestId('icon-picker-tab-generate'));
    });
    expect(screen.getByTestId('icon-picker-generate').textContent).toMatch(/disabled/i);
  });

  test('generate tab: feature flag on calls gateway; raster fallback is rejected', async () => {
    process.env.CENSAAI_AGENT_ICON_GENERATOR = '1';
    // Mock the gateway to return a raster fallback first (rejected),
    // then valid SVG on the second call (accepted).
    let calls = 0;
    setIconGatewayCaller(async () => {
      calls += 1;
      return calls === 1 ? RASTER_FALLBACK : VALID_SVG;
    });

    const onChange = jest.fn();
    render(<AgentIconPicker value={null} onChange={onChange} />);
    act(() => {
      fireEvent.click(screen.getByTestId('icon-picker-tab-generate'));
    });
    const promptInput = screen.getByTestId('icon-picker-generate-prompt');
    act(() => {
      fireEvent.change(promptInput, { target: { value: 'a compass rose' } });
    });

    // First click: raster fallback → rejected, onChange NOT called.
    await act(async () => {
      fireEvent.click(screen.getByTestId('icon-picker-generate-btn'));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('icon-picker-error').textContent).toMatch(/raster fallback/i);

    // Second click: valid SVG → accepted.
    await act(async () => {
      fireEvent.click(screen.getByTestId('icon-picker-generate-btn'));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toContain('<svg');
  });
});