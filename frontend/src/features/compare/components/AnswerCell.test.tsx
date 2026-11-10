import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnswerCell } from './AnswerCell';
import type { CompareModel, ResultAnswer } from '../types';

describe('AnswerCell', () => {
  const model: CompareModel = {
    id: 'claude-demo',
    name: 'Claude Haiku 5.5',
    provider: 'Anthropic',
  };

  it('renders success state with thought, content, and metadata', () => {
    const successAnswer: ResultAnswer = {
      state: 'success',
      markdown: 'Hello **World**',
      durationLabel: '2,1 с',
      costLabel: '$0,0021',
      thought: {
        text: 'Analyzing prompt...',
        durationSeconds: 4,
      },
    };

    render(
      <AnswerCell
        model={model}
        turnId="turn-1"
        answer={successAnswer}
        onRetry={vi.fn()}
      />
    );

    // Label on cell
    expect(
      screen.getByLabelText('Claude Haiku 5.5, turn-1')
    ).toBeInTheDocument();

    // Thought status
    expect(screen.getByRole('button', { name: 'Думала 4 секунды' })).toHaveAttribute('aria-expanded', 'false');

    // Markdown content
    expect(screen.getByText('World')).toBeInTheDocument();

    // Metadata
    expect(screen.getByText('2,1 с · $0,0021')).toBeInTheDocument();
  });

  it('renders error state with AnswerError and calls onRetry when clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const errorAnswer: ResultAnswer = {
      state: 'error',
      message: 'Модель не ответила за 60 секунд',
      description: 'Остальные ответы сохранены.',
    };

    render(
      <AnswerCell
        model={model}
        turnId="turn-1"
        answer={errorAnswer}
        onRetry={onRetry}
      />
    );

    expect(screen.getByText('Модель не ответила за 60 секунд')).toBeInTheDocument();
    expect(screen.getByText('Остальные ответы сохранены.')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /повторить/i });
    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);

    // No metadata in error state
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it('renders an empty cell with accessible label when answer is undefined', () => {
    render(
      <AnswerCell
        model={model}
        turnId="turn-1"
        answer={undefined}
        onRetry={vi.fn()}
      />
    );

    const emptyCell = screen.getByLabelText('Нет ответа: Claude Haiku 5.5');
    expect(emptyCell).toBeInTheDocument();
    expect(emptyCell.textContent).toBe('');
  });
});

