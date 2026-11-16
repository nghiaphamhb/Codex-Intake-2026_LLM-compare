import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnswerCell } from './AnswerCell';
import type { CompareModel, ResultAnswer } from '../types';

describe('AnswerCell', () => {
  it('keeps the focused Stop button mounted when the first delta arrives', () => {
    const props = {
      model: { id: 'm', name: 'Model', provider: 'Test' },
      turnId: 't',
      onRetry: vi.fn(),
      onStop: vi.fn(),
    };
    const { rerender } = render(
      <AnswerCell {...props} answer={{ state: 'pending', requestId: 'r' }} />,
    );
    const stop = screen.getByRole('button', { name: 'Остановить ответ: Model' });
    stop.focus();
    rerender(
      <AnswerCell
        {...props}
        answer={{ state: 'streaming', requestId: 'r', markdown: 'partial', reasoning: '' }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Остановить ответ: Model' })).toBe(stop);
    expect(stop).toHaveFocus();
  });

  it.each(['stopped', 'error'] as const)(
    'focuses Retry, not the reasoning toggle, after %s',
    (state) => {
      const props = {
        model: { id: 'm', name: 'Model', provider: 'Test' },
        turnId: 't',
        onRetry: vi.fn(),
        onStop: vi.fn(),
      };
      const content = { requestId: 'r', markdown: 'partial', reasoning: 'actual reasoning' };
      const { rerender } = render(
        <AnswerCell {...props} answer={{ state: 'streaming', ...content }} />,
      );
      screen.getByRole('button', { name: 'Остановить ответ: Model' }).focus();
      rerender(
        <AnswerCell
          {...props}
          answer={{ state, ...content, message: 'failure', description: 'Retry later' }}
        />,
      );
      expect(screen.getByRole('button', { name: 'Повторить' })).toHaveFocus();
    },
  );
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

    render(<AnswerCell model={model} turnId="turn-1" answer={successAnswer} onRetry={vi.fn()} />);

    // Label on cell
    expect(screen.getByLabelText('Claude Haiku 5.5, turn-1')).toBeInTheDocument();

    // Thought status
    expect(screen.getByRole('button', { name: 'Думала 4 секунды' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    // Markdown content
    expect(screen.getByText('World')).toBeInTheDocument();

    // Metadata
    expect(screen.getByTestId('cell-claude-demo-turn-1')).toHaveTextContent('2,1 с · $0,0021');
  });

  it.each(['$0,0016', '$0,0000', '< $0,0001'])(
    'explains the estimate accessibly without extra visible metadata for %s',
    (costLabel) => {
      render(
        <AnswerCell
          model={model}
          turnId="turn-1"
          answer={{
            state: 'success',
            markdown: 'Answer',
            durationLabel: '1,8 с',
            costLabel,
          }}
          onRetry={vi.fn()}
        />,
      );
      const cost = screen.getByText(costLabel);
      expect(cost).toHaveAttribute(
        'title',
        `Оценочная стоимость: ${costLabel}. Стандартные тарифы; кэш и специальные тарифы не учтены.`,
      );
      expect(cost).toHaveAttribute('aria-label', cost.getAttribute('title'));
      expect(cost.parentElement).toHaveTextContent(`1,8 с · ${costLabel}`);
      expect(cost.parentElement?.textContent).toBe(`1,8 с · ${costLabel}`);
      expect(screen.queryByText(/token|usage|токен/i)).not.toBeInTheDocument();
    },
  );

  it('renders success state without separator when costLabel is undefined', () => {
    const successWithoutCost: ResultAnswer = {
      state: 'success',
      markdown: 'Answer without cost',
      durationLabel: '1,5 с',
    };

    render(
      <AnswerCell model={model} turnId="turn-1" answer={successWithoutCost} onRetry={vi.fn()} />,
    );

    expect(screen.getByText('1,5 с')).toBeInTheDocument();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it('renders pending state using AnswerStatus waiting', () => {
    const pendingAnswer: ResultAnswer = {
      state: 'pending',
      requestId: 'req-1',
    };

    render(<AnswerCell model={model} turnId="turn-1" answer={pendingAnswer} onRetry={vi.fn()} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Ждём ответ…')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-line')).toHaveLength(3);
  });

  it('renders error state with AnswerError and calls onRetry when clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const errorAnswer: ResultAnswer = {
      state: 'error',
      message: 'Модель не ответила за 60 секунд',
      description: 'Остальные ответы сохранены.',
    };

    render(<AnswerCell model={model} turnId="turn-1" answer={errorAnswer} onRetry={onRetry} />);

    expect(screen.getByText('Модель не ответила за 60 секунд')).toBeInTheDocument();
    expect(screen.getByText('Остальные ответы сохранены.')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /повторить/i });
    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);

    // No metadata in error state
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it('renders placeholder text when answer is undefined without error or retry', () => {
    render(<AnswerCell model={model} turnId="turn-1" answer={undefined} onRetry={vi.fn()} />);

    const emptyCell = screen.getByLabelText('Нет ответа: Claude Haiku 5.5');
    expect(emptyCell).toBeInTheDocument();
    expect(emptyCell).toHaveTextContent('Модель добавлена после этого вопроса.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders pending state with Stop button and aria-busy=true', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(
      <AnswerCell
        model={model}
        turnId="turn-1"
        answer={{ state: 'pending', requestId: 'req-1' }}
        onRetry={vi.fn()}
        onStop={onStop}
      />,
    );

    const cell = screen.getByTestId('cell-claude-demo-turn-1');
    expect(cell).toHaveAttribute('aria-busy', 'true');

    const stopBtn = screen.getByRole('button', { name: 'Остановить ответ: Claude Haiku 5.5' });
    expect(stopBtn).toBeInTheDocument();
    await user.click(stopBtn);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('renders streaming state with partial markdown, reasoning toggle, and Stop button', () => {
    render(
      <AnswerCell
        model={model}
        turnId="turn-1"
        answer={{
          state: 'streaming',
          requestId: 'req-1',
          markdown: 'Partial **answer**',
          reasoning: 'Deep thoughts...',
        }}
        onRetry={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const cell = screen.getByTestId('cell-claude-demo-turn-1');
    expect(cell).toHaveAttribute('aria-busy', 'true');

    // Thought status with live label 'Рассуждения'
    expect(screen.getByRole('button', { name: 'Рассуждения' })).toBeInTheDocument();

    // Partial markdown
    expect(screen.getByText('answer')).toBeInTheDocument();

    // Generating status
    expect(screen.getByText('Печатает…')).toBeInTheDocument();

    // Stop button
    expect(
      screen.getByRole('button', { name: 'Остановить ответ: Claude Haiku 5.5' }),
    ).toBeInTheDocument();
  });

  it('renders reasoning-only streaming state with Получаем ответ… status', () => {
    render(
      <AnswerCell
        model={model}
        turnId="turn-1"
        answer={{
          state: 'streaming',
          requestId: 'req-1',
          markdown: '',
          reasoning: 'Reasoning only...',
        }}
        onRetry={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByText('Получаем ответ…')).toBeInTheDocument();
    expect(screen.queryByText('Печатает…')).toBeNull();
  });

  it('renders stopped state with partial content, status label, and Retry button', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <AnswerCell
        model={model}
        turnId="turn-1"
        answer={{
          state: 'stopped',
          requestId: 'req-1',
          markdown: 'Cut off answer',
          reasoning: 'Prior thoughts',
        }}
        onRetry={onRetry}
      />,
    );

    const cell = screen.getByTestId('cell-claude-demo-turn-1');
    expect(cell).toHaveAttribute('aria-busy', 'false');

    expect(screen.getByRole('button', { name: 'Рассуждения' })).toBeInTheDocument();
    expect(screen.getByText('Cut off answer')).toBeInTheDocument();

    expect(screen.getByText('Генерация остановлена.')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: 'Повторить' });
    expect(retryBtn).toBeInTheDocument();
    await user.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);

    // No Stop button and no metadata in stopped state
    expect(screen.queryByRole('button', { name: /остановить/i })).toBeNull();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it('renders error state with partial markdown and reasoning retained above AnswerError', () => {
    render(
      <AnswerCell
        model={model}
        turnId="turn-1"
        answer={{
          state: 'error',
          requestId: 'req-1',
          message: 'Error message',
          description: 'Try later',
          markdown: 'Partial markdown before crash',
          reasoning: 'Partial reasoning before crash',
        }}
        onRetry={vi.fn()}
      />,
    );

    const cell = screen.getByTestId('cell-claude-demo-turn-1');
    expect(cell).toHaveAttribute('aria-busy', 'false');

    expect(screen.getByRole('button', { name: 'Рассуждения' })).toBeInTheDocument();
    expect(screen.getByText('Partial markdown before crash')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('transfers focus from Stop button to Retry button when transitioning to stopped', () => {
    const { rerender } = render(
      <AnswerCell
        model={model}
        turnId="turn-1"
        answer={{ state: 'pending', requestId: 'req-1' }}
        onRetry={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const stopBtn = screen.getByRole('button', { name: 'Остановить ответ: Claude Haiku 5.5' });
    stopBtn.focus();
    expect(document.activeElement).toBe(stopBtn);

    // Transition to stopped
    rerender(
      <AnswerCell
        model={model}
        turnId="turn-1"
        answer={{
          state: 'stopped',
          requestId: 'req-1',
          markdown: 'Partial',
          reasoning: '',
        }}
        onRetry={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const retryBtn = screen.getByRole('button', { name: 'Повторить' });
    expect(document.activeElement).toBe(retryBtn);
  });
});
