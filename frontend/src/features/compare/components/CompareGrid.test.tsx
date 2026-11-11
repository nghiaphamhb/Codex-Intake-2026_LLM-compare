import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompareGrid } from './CompareGrid';
import { desktopModels, desktopTurns } from '../desktopFixtures';
import type { CompareTurn } from '../types';

describe('CompareGrid', () => {
  it.each([2, 3, 4])('maps literal answers to the correct column for %i models', (count) => {
    const models = [
      { id: 'a', name: 'Alpha', provider: 'Test' },
      { id: 'b', name: 'Beta', provider: 'Test' },
      { id: 'c', name: 'Gamma', provider: 'Test' },
      { id: 'd', name: 'Delta', provider: 'Test' },
    ].slice(0, count);
    const success = (markdown: string) => ({
      state: 'success' as const,
      markdown,
      durationLabel: '0s',
      costLabel: '$0',
    });
    const turns: CompareTurn[] = [
      {
        id: 'mapping',
        question: 'Mapping?',
        answers: {
          d: success('Fourth answer'),
          c: success('Third answer'),
          b: success('Second answer'),
          a: success('First answer'),
        },
      },
    ];
    render(<CompareGrid models={models} turns={turns} onAction={vi.fn()} />);
    const cells = screen.getAllByLabelText(/, mapping$/);
    for (const [index, text] of ['First answer', 'Second answer', 'Third answer', 'Fourth answer']
      .slice(0, count)
      .entries()) {
      expect(within(cells[index]).getByText(text)).toBeInTheDocument();
      expect(cells[index]).toHaveAttribute('aria-label', `${models[index].name}, mapping`);
    }
  });

  it('renders each question exactly once', () => {
    render(<CompareGrid models={desktopModels} turns={desktopTurns} onAction={vi.fn()} />);

    const question1Matches = screen.getAllByText(desktopTurns[0].question);
    expect(question1Matches).toHaveLength(1);

    const question2Matches = screen.getAllByText(desktopTurns[1].question);
    expect(question2Matches).toHaveLength(1);
  });

  it('renders 6 answer cells corresponding to 3 models x 2 turns', () => {
    render(<CompareGrid models={desktopModels} turns={desktopTurns} onAction={vi.fn()} />);

    for (const turn of desktopTurns) {
      for (const model of desktopModels) {
        expect(screen.getByLabelText(`${model.name}, ${turn.id}`)).toBeInTheDocument();
      }
    }
  });

  it('preserves model column order according to models array even if answers object keys are reversed', () => {
    const reversedTurns: CompareTurn[] = [
      {
        id: 'turn-rev',
        question: 'Reversed test?',
        answers: {
          'giga-demo': {
            state: 'success',
            markdown: 'Answer from Giga',
            durationLabel: '1s',
            costLabel: '$0.01',
          },
          'yandex-demo': {
            state: 'success',
            markdown: 'Answer from Yandex',
            durationLabel: '1s',
            costLabel: '$0.01',
          },
          'claude-demo': {
            state: 'success',
            markdown: 'Answer from Claude',
            durationLabel: '1s',
            costLabel: '$0.01',
          },
        },
      },
    ];

    const { container } = render(
      <CompareGrid models={desktopModels} turns={reversedTurns} onAction={vi.fn()} />,
    );

    const cells = container.querySelectorAll('[data-testid^="cell-"]');
    expect(cells).toHaveLength(3);
    // Order in DOM should match desktopModels: claude, then yandex, then giga
    expect(cells[0]).toHaveAttribute('data-testid', 'cell-claude-demo-turn-rev');
    expect(cells[1]).toHaveAttribute('data-testid', 'cell-yandex-demo-turn-rev');
    expect(cells[2]).toHaveAttribute('data-testid', 'cell-giga-demo-turn-rev');
    expect(within(cells[0] as HTMLElement).getByText('Answer from Claude')).toBeInTheDocument();
    expect(within(cells[1] as HTMLElement).getByText('Answer from Yandex')).toBeInTheDocument();
    expect(within(cells[2] as HTMLElement).getByText('Answer from Giga')).toBeInTheDocument();
  });

  it('preserves slot when an answer is missing', () => {
    const missingTurns: CompareTurn[] = [
      {
        id: 'turn-missing',
        question: 'Missing answer test',
        answers: {
          'claude-demo': {
            state: 'success',
            markdown: 'Answer from Claude',
            durationLabel: '1s',
            costLabel: '$0.01',
          },
          // yandex-demo is undefined/missing
          'giga-demo': {
            state: 'success',
            markdown: 'Answer from Giga',
            durationLabel: '1s',
            costLabel: '$0.01',
          },
        },
      },
    ];

    render(<CompareGrid models={desktopModels} turns={missingTurns} onAction={vi.fn()} />);

    expect(screen.getByLabelText('Нет ответа: YandexGPT 5 Lite')).toBeInTheDocument();
  });

  it('calls onAction with remove-model when remove button in ModelHeader is clicked', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(<CompareGrid models={desktopModels} turns={desktopTurns} onAction={onAction} />);

    const removeClaudeBtn = screen.getByRole('button', {
      name: /удалить модель claude haiku 5.5/i,
    });
    await user.click(removeClaudeBtn);

    expect(onAction).toHaveBeenCalledWith({
      type: 'remove-model',
      modelId: 'claude-demo',
    });
  });

  it('calls onAction with retry when retry button in error cell is clicked', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(<CompareGrid models={desktopModels} turns={desktopTurns} onAction={onAction} />);

    const gigaCell = screen.getByLabelText('GigaChat 2, turn-1');
    const retryBtn = within(gigaCell).getByRole('button', {
      name: /повторить/i,
    });
    await user.click(retryBtn);

    expect(onAction).toHaveBeenCalledWith({
      type: 'retry',
      turnId: 'turn-1',
      modelId: 'giga-demo',
    });
  });

  it('renders empty state message when turns list is empty while preserving model bar', () => {
    render(<CompareGrid models={desktopModels} turns={[]} onAction={vi.fn()} />);

    expect(screen.getByText('Задайте вопрос, чтобы начать сравнение.')).toBeInTheDocument();
    // Sticky model bar still shows models
    for (const model of desktopModels) {
      expect(screen.getByText(model.name)).toBeInTheDocument();
    }
  });

  it('disables model remove buttons when only 2 models are displayed', () => {
    const twoModels = desktopModels.slice(0, 2);
    render(<CompareGrid models={twoModels} turns={desktopTurns} onAction={vi.fn()} />);

    const disabledButtons = screen.getAllByRole('button', {
      name: 'Нужно оставить минимум 2 модели',
    });
    expect(disabledButtons).toHaveLength(2);
    expect(disabledButtons[0]).toBeDisabled();
    expect(disabledButtons[1]).toBeDisabled();
  });
});
