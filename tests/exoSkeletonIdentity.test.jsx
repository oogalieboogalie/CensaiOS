/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { ExoSkeletonAttributes } from '../src/components/ExoSkeletonAttributes.jsx';

describe('Exo-Skeleton identity editor', () => {
  test('distinguishes source-reviewed mindset candidates from persona attributes', () => {
    const toggleAttribute = jest.fn();
    const toggleMindset = jest.fn();
    render(React.createElement(ExoSkeletonAttributes, {
      agent: { id: 'atlas', name: 'Atlas', role: 'Backend', system_prompt: 'You are Atlas.' },
      allAttributes: [{ id: 'technical', name: 'Technical', description: 'Precise', category: 'cognitive' }],
      equippedAttributes: [],
      allMindsets: [{ id: 'mindset_first', name: 'First Principles', description: 'Start from facts', category: 'analytical' }],
      equippedMindsets: ['mindset_first'],
      previewPrompt: 'You are Atlas.',
      saveError: '',
      handleToggleAttribute: toggleAttribute,
      handleToggleMindset: toggleMindset,
    }));
    expect(screen.getByText('Source-reviewed candidates')).toBeInTheDocument();
    expect(screen.getAllByText('First Principles')).toHaveLength(2);
    expect(screen.queryByText('No operating mindset equipped.')).not.toBeInTheDocument();
    const mindset = screen.getByRole('button', { name: /First Principles/ });
    expect(mindset).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(mindset);
    expect(toggleMindset).toHaveBeenCalledWith('mindset_first');
  });
});
