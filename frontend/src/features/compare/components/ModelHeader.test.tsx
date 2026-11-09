import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelHeader } from './ModelHeader';

describe('ModelHeader', () => {
  it('renders name and provider, with full text in title attribute', () => {
    render(<ModelHeader name="GPT-4o mini" provider="OpenAI" />);

    const nameEl = screen.getByText('GPT-4o mini');
    const providerEl = screen.getByText('OpenAI');

    expect(nameEl).toBeInTheDocument();
    expect(nameEl).toHaveAttribute('title', 'GPT-4o mini');

    expect(providerEl).toBeInTheDocument();
    expect(providerEl).toHaveAttribute('title', 'OpenAI');
  });

  it('renders remove button when onRemove callback is provided, with Russian label containing model name', async () => {
    const user = userEvent.setup();
    const handleRemove = vi.fn();

    render(<ModelHeader name="Claude 3.5 Sonnet" provider="Anthropic" onRemove={handleRemove} />);

    // Russian accessible name containing model name
    const removeButton = screen.getByRole('button', { name: /удалить.*Claude 3\.5 Sonnet/i });
    expect(removeButton).toBeInTheDocument();

    await user.click(removeButton);
    expect(handleRemove).toHaveBeenCalledTimes(1);
  });

  it('does not render remove button when onRemove is not provided', () => {
    render(<ModelHeader name="GigaChat" provider="Sber" />);
    const buttons = screen.queryAllByRole('button');
    expect(buttons).toHaveLength(0);
  });
});

