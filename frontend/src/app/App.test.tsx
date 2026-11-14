import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import * as comparisonApi from '../features/compare/comparisonApi';

describe('App routing via search params', () => {
  let originalUrl: string;

  beforeEach(() => {
    originalUrl = window.location.href;
    vi.spyOn(comparisonApi, 'fetchModels').mockResolvedValue([
      { id: 'm1', name: 'Model 1', provider: 'P1' },
      { id: 'm2', name: 'Model 2', provider: 'P2' },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', originalUrl);
  });

  it('renders ComparePage by default when no query string is provided', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);

    expect(screen.getByTestId('compare-page')).toBeInTheDocument();
    expect(screen.queryByText(/Витрина компонентов \(FE003\)/)).toBeNull();
  });

  it('renders ComponentShowcase when view=components', () => {
    window.history.replaceState({}, '', '/?view=components');
    render(<App />);

    expect(screen.getByText(/Витрина компонентов \(FE003\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('compare-page')).toBeNull();
  });

  it('renders ComparePage when view has an unknown value', async () => {
    window.history.replaceState({}, '', '/?view=unknown-value');
    render(<App />);

    expect(screen.getByTestId('compare-page')).toBeInTheDocument();
    expect(screen.queryByText(/Витрина компонентов \(FE003\)/)).toBeNull();
  });
});
