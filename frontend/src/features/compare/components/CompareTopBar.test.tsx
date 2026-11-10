import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompareTopBar } from './CompareTopBar';

describe('CompareTopBar', () => {
  it('renders logo and brand title', () => {
    const { container } = render(
      <CompareTopBar onShare={vi.fn()} onNewComparison={vi.fn()} />
    );

    expect(screen.getByText('LLM Compare')).toBeInTheDocument();
    const logoImg = container.querySelector('img[src*="logo.svg"]');
    expect(logoImg).toBeInTheDocument();
  });

  it('renders share and new comparison buttons with Russian labels', () => {
    render(<CompareTopBar onShare={vi.fn()} onNewComparison={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: /скопировать ссылку/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /новое сравнение/i })
    ).toBeInTheDocument();
  });

  it('calls onShare when share button is clicked', async () => {
    const user = userEvent.setup();
    const onShare = vi.fn();
    render(<CompareTopBar onShare={onShare} onNewComparison={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: /скопировать ссылку/i })
    );
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('calls onNewComparison when new comparison button is clicked', async () => {
    const user = userEvent.setup();
    const onNewComparison = vi.fn();
    render(<CompareTopBar onShare={vi.fn()} onNewComparison={onNewComparison} />);

    await user.click(screen.getByRole('button', { name: /новое сравнение/i }));
    expect(onNewComparison).toHaveBeenCalledTimes(1);
  });
});

