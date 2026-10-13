/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { ExoSkeletonAttributes, addedByPicks } from '../src/components/ExoSkeletonAttributes.jsx';

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
      previewPrompt: 'You are Atlas.\n## Operating mindsets\n- First Principles: Start from facts',
      previewTemplate: 'You are Atlas.',
      saveError: '',
      handleToggleAttribute: toggleAttribute,
      handleToggleMindset: toggleMindset,
    }));
    expect(screen.getByText('Source-reviewed candidates')).toBeInTheDocument();
    // The preview shows only what the picks add, exactly as the agent reads it.
    expect(screen.getByTestId('exo-added-by-picks')).toHaveTextContent('## Operating mindsets - First Principles: Start from facts');
    expect(screen.getByTestId('exo-added-by-picks')).not.toHaveTextContent('You are Atlas.');
    const mindset = screen.getByRole('button', { name: /First Principles/ });
    expect(mindset).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(mindset);
    expect(toggleMindset).toHaveBeenCalledWith('mindset_first');
  });

  test('the preview says so when nothing is picked', () => {
    expect(addedByPicks('You are Atlas.', 'You are Atlas.')).toBe('');
    expect(addedByPicks('You are a very precise Atlas.', 'You are {{ a very $technical }} Atlas.'))
      .toBe('You are a very precise Atlas.');
  });
});
