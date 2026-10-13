/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CodeEditorContextMenu } from '../src/components/codeEditor/CodeEditorContextMenu.jsx';

const baseProps = {
  x: 100, y: 100, hasSelection: true, canFormat: true, formatHint: 'Prettier · HTML',
  onFormatDocument: jest.fn(), onFormatSelection: jest.fn(), onAskAgent: jest.fn(), onClose: jest.fn(),
};

describe('CodeEditorContextMenu', () => {
  test('renders all three actions and fires handlers', () => {
    render(React.createElement(CodeEditorContextMenu, baseProps));
    fireEvent.click(screen.getByText('Format document'));
    expect(baseProps.onFormatDocument).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Format selection'));
    expect(baseProps.onFormatSelection).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Ask agent to fix…'));
    expect(baseProps.onAskAgent).toHaveBeenCalledTimes(1);
    // Each action dismisses the menu.
    expect(baseProps.onClose).toHaveBeenCalledTimes(3);
  });
  test('disables selection actions when nothing is selected', () => {
    render(React.createElement(CodeEditorContextMenu, { ...baseProps, hasSelection: false }));
    expect(screen.getByText('Format selection').closest('button').disabled).toBe(true);
    expect(screen.getByText('Ask agent to fix…').closest('button').disabled).toBe(true);
  });
  test('disables formatting when the language has no formatter', () => {
    render(React.createElement(CodeEditorContextMenu, { ...baseProps, canFormat: false }));
    expect(screen.getByText('Format document').closest('button').disabled).toBe(true);
  });
});
