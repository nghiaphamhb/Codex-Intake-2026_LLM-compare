import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComparePage } from './ComparePage';
import { desktopModels, desktopTurns } from './desktopFixtures';

describe('ComparePage', () => {
  it('keeps the comparison explanation below its heading in the Claude answer', () => {
    render(<ComparePage />);
    const answer = screen.getByLabelText('Claude Haiku 5.5, turn-1');
    const heading = within(answer).getByRole('heading', { name: 'Чем отличается от аналогов' });
    const explanation = within(answer).getByText(/Классические редакторы хранят результат как HTML/);
    expect(heading.compareDocumentPosition(explanation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(explanation).getByText('JSON', { selector: 'code' })).toBeInTheDocument();
  });

  it('renders default page with brand, actions, models, turns, add column, and empty prompt form', () => {
    render(<ComparePage />);

    // Brand & header actions
    expect(screen.getByText('LLM Compare')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /скопировать ссылку/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /новое сравнение/i })
    ).toBeInTheDocument();

    // Models in header
    for (const model of desktopModels) {
      expect(screen.getByText(model.name)).toBeInTheDocument();
    }

    // Turns questions
    for (const turn of desktopTurns) {
      expect(screen.getByText(turn.question)).toBeInTheDocument();
    }

    // Add model button
    expect(
      screen.getByRole('button', { name: 'Добавить модель' })
    ).toBeInTheDocument();

    // Prompt composer
    const textarea = screen.getByRole('textbox', {
      name: /задайте вопрос всем моделям/i,
    });
    expect(textarea).toHaveValue('');

    const sendBtn = screen.getByRole('button', { name: /отправить вопрос/i });
    expect(sendBtn).toBeDisabled();

    // Initial status should be empty
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
  });

  it('updates input when typing and displays demo message on submit without clearing input or adding turn', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const textarea = screen.getByRole('textbox', {
      name: /задайте вопрос всем моделям/i,
    });
    const sendBtn = screen.getByRole('button', { name: /отправить вопрос/i });

    await user.type(textarea, 'Привет, новый вопрос!');
    expect(textarea).toHaveValue('Привет, новый вопрос!');
    expect(sendBtn).toBeEnabled();

    await user.click(sendBtn);

    // Prompt value should remain unchanged in demo mode
    expect(textarea).toHaveValue('Привет, новый вопрос!');

    // Status area shows Russian demo message
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(
      'Демо: действие «Отправить сообщение» пока не подключено.'
    );

    // Number of questions rendered should still be 2 (no turn added)
    expect(screen.getAllByText(desktopTurns[0].question)).toHaveLength(1);
    expect(screen.getAllByText(desktopTurns[1].question)).toHaveLength(1);
    expect(
      screen.queryByText('Привет, новый вопрос!', { selector: 'div' })
    ).toBeNull();
  });

  it('shows demo message for header actions without mutating page', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const shareBtn = screen.getByRole('button', {
      name: /скопировать ссылку/i,
    });
    await user.click(shareBtn);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Демо: действие «Скопировать ссылку» пока не подключено.'
    );

    const newBtn = screen.getByRole('button', {
      name: /новое сравнение/i,
    });
    await user.click(newBtn);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Демо: действие «Новое сравнение» пока не подключено.'
    );
  });

  it('shows demo message for add-model and remove-model without modifying models list', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const addBtn = screen.getByRole('button', { name: 'Добавить модель' });
    await user.click(addBtn);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Демо: действие «Добавить модель» пока не подключено.'
    );

    const removeBtn = screen.getByRole('button', {
      name: /удалить модель claude haiku 5.5/i,
    });
    await user.click(removeBtn);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Демо: действие «Удалить модель» пока не подключено.'
    );

    // Model still exists
    expect(screen.getByText('Claude Haiku 5.5')).toBeInTheDocument();
  });

  it('shows demo message for retry in error cell without clearing error', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const gigaCell = screen.getByLabelText('GigaChat 2, turn-1');
    const retryBtn = within(gigaCell).getByRole('button', {
      name: /повторить/i,
    });
    await user.click(retryBtn);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Демо: действие «Повторить запрос» пока не подключено.'
    );

    // Error is still displayed
    expect(
      screen.getByText('Модель не ответила за 60 секунд')
    ).toBeInTheDocument();
  });
});
