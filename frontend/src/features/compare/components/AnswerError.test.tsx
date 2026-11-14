import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnswerError } from './AnswerError';

describe('AnswerError', () => {
  it('renders warning icon, error message, and optional description', () => {
    const { container } = render(
      <AnswerError
        message="Ошибка генерации"
        description="Превышен лимит запросов к модели."
        onRetry={() => {}}
      />,
    );

    expect(screen.getByText('Ошибка генерации')).toBeInTheDocument();
    expect(screen.getByText('Превышен лимит запросов к модели.')).toBeInTheDocument();

    expect(container.querySelectorAll('img, use, image')).toHaveLength(0);
    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(2);
    expect(icons[0]).toHaveAttribute('viewBox', '0 0 20 20');
    expect(icons[1]).toHaveAttribute('viewBox', '0 0 16 16');
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveAttribute('focusable', 'false');
      expect(icon.querySelector('path')).not.toBeNull();
    }
  });

  it('renders "Повторить" button and calls onRetry callback when clicked', async () => {
    const user = userEvent.setup();
    const handleRetry = vi.fn();

    render(<AnswerError message="Network error" onRetry={handleRetry} />);

    const button = screen.getByRole('button', { name: 'Повторить' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('disables retry button when retryDisabled is true and does not trigger callback', async () => {
    const user = userEvent.setup();
    const handleRetry = vi.fn();

    render(<AnswerError message="Network error" onRetry={handleRetry} retryDisabled={true} />);

    const button = screen.getByRole('button', { name: 'Повторить' });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(handleRetry).not.toHaveBeenCalled();
  });
});
