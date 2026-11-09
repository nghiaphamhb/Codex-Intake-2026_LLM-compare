import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnswerStatus } from './AnswerStatus';

describe('AnswerStatus', () => {
  it('renders "Ждём ответ…" and skeleton lines for waiting state', () => {
    const { container } = render(<AnswerStatus state="waiting" />);
    expect(screen.getByText('Ждём ответ…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    const skeletons = container.querySelectorAll('[data-testid="skeleton-line"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Печатает…" for generating state', () => {
    render(<AnswerStatus state="generating" />);
    expect(screen.getByText('Печатает…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

