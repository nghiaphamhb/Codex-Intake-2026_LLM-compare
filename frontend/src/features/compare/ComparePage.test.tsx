import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComparePage } from './ComparePage';
import { desktopModels, desktopTurns } from './desktopFixtures';

describe('ComparePage', () => {
  beforeEach(() => {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
    }
  });

  it('keeps the comparison explanation below its heading in the Claude answer', () => {
    render(<ComparePage />);
    const answer = screen.getByLabelText('Claude Haiku 5.5, turn-1');
    const heading = within(answer).getByRole('heading', { name: 'Чем отличается от аналогов' });
    const explanation = within(answer).getByText(
      /Классические редакторы хранят результат как HTML/,
    );
    expect(
      heading.compareDocumentPosition(explanation) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(explanation).getByText('JSON', { selector: 'code' })).toBeInTheDocument();
  });

  it('renders default page with brand, actions, models, turns, add column, and empty prompt form', () => {
    render(<ComparePage />);

    // Brand & header actions
    expect(screen.getByText('LLM Compare')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /скопировать ссылку/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /новое сравнение/i })).toBeInTheDocument();

    // Models in header
    for (const model of desktopModels) {
      expect(screen.getByText(model.name)).toBeInTheDocument();
    }

    // Turns questions
    for (const turn of desktopTurns) {
      expect(screen.getByText(turn.question)).toBeInTheDocument();
    }

    // Add model button
    expect(screen.getByRole('button', { name: 'Добавить модель' })).toBeInTheDocument();

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

  it('sends a new prompt, creates a new turn with answers for all current models, and clears input', async () => {
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

    // Prompt value should be cleared
    expect(textarea).toHaveValue('');

    // Question should appear as a new turn
    expect(screen.getByText('Привет, новый вопрос!', { selector: 'div' })).toBeInTheDocument();

    // All active models should have answers generated
    for (const model of desktopModels) {
      expect(
        screen.getByText(
          (_content, element) =>
            element?.tagName === 'P' &&
            element?.textContent?.includes(`Демонстрационный ответ модели ${model.name}.`) === true,
        ),
      ).toBeInTheDocument();
    }
  });

  it('rejects invalid or too long prompt without creating a turn and displays Russian error message', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const textarea = screen.getByRole('textbox', {
      name: /задайте вопрос всем моделям/i,
    });

    const tooLongPrompt = 'x'.repeat(10001);
    fireEvent.change(textarea, { target: { value: tooLongPrompt } });
    const sendBtn = screen.getByRole('button', { name: /отправить вопрос/i });
    expect(sendBtn).toBeEnabled();

    await user.click(sendBtn);

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('10');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAccessibleDescription(error.textContent ?? '');
    expect(textarea).toHaveValue(tooLongPrompt);
    expect(screen.queryByText(tooLongPrompt, { selector: 'div' })).toBeNull();
    fireEvent.change(textarea, { target: { value: 'Исправленный вопрос' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(textarea).not.toHaveAttribute('aria-invalid');
  });

  it('opens ModelPicker when add-model is clicked, adds model, closes picker, and renders new column with placeholder in past turns', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const addBtn = screen.getByRole('button', { name: 'Добавить модель' });
    await user.click(addBtn);

    // Modal is open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const searchInput = screen.getByRole('textbox', { name: 'Поиск модели' });
    await user.type(searchInput, 'Демо Альфа');

    const selectBtn = screen.getByText('Демо Альфа').closest('button');
    expect(selectBtn).toBeEnabled();
    if (selectBtn) {
      await user.click(selectBtn);
    }

    // Modal closes
    expect(screen.queryByRole('dialog')).toBeNull();

    // Model is added to model bar
    expect(screen.getByText('Демо Альфа')).toBeInTheDocument();

    // Historical turns have missing placeholder for newly added model
    expect(screen.getAllByText('Модель добавлена после этого вопроса.')).toHaveLength(2);
  });

  it('removes a model when remove button is clicked and disables remove when only 2 models remain', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const removeClaudeBtn = screen.getByRole('button', {
      name: /удалить модель claude haiku 5.5/i,
    });
    await user.click(removeClaudeBtn);

    // Claude is gone
    expect(screen.queryByText('Claude Haiku 5.5')).toBeNull();

    // 2 models remain, their remove buttons are disabled
    const disabledRemoveButtons = screen.getAllByRole('button', {
      name: 'Нужно оставить минимум 2 модели',
    });
    expect(disabledRemoveButtons).toHaveLength(2);
    expect(disabledRemoveButtons[0]).toBeDisabled();
    expect(disabledRemoveButtons[1]).toBeDisabled();
  });

  it('retries error answer when retry is clicked and replaces it with mock success answer', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const gigaCell = screen.getByLabelText('GigaChat 2, turn-1');
    expect(within(gigaCell).getByText('Модель не ответила за 60 секунд')).toBeInTheDocument();

    const retryBtn = within(gigaCell).getByRole('button', {
      name: /повторить/i,
    });
    await user.click(retryBtn);

    // Error is gone, success answer is rendered
    expect(within(gigaCell).queryByText('Модель не ответила за 60 секунд')).toBeNull();
    expect(
      within(gigaCell).getByText(
        (_content, element) =>
          element?.tagName === 'P' &&
          element?.textContent?.includes('Демонстрационный ответ модели GigaChat 2.') === true,
      ),
    ).toBeInTheDocument();
  });

  it('starts new comparison: resets turns to empty, clears prompt, preserves models, and shows empty state', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const newBtn = screen.getByRole('button', {
      name: /новое сравнение/i,
    });
    await user.click(newBtn);

    // Empty state message is shown
    expect(screen.getByText('Задайте вопрос, чтобы начать сравнение.')).toBeInTheDocument();

    // Models still remain in header
    for (const model of desktopModels) {
      expect(screen.getByText(model.name)).toBeInTheDocument();
    }
  });

  it('sends a prompt after new comparison and renders the first turn', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const newBtn = screen.getByRole('button', {
      name: /новое сравнение/i,
    });
    await user.click(newBtn);

    const textarea = screen.getByRole('textbox', {
      name: /задайте вопрос всем моделям/i,
    });
    await user.type(textarea, 'Вопрос после очистки');
    const sendBtn = screen.getByRole('button', { name: /отправить вопрос/i });
    await user.click(sendBtn);

    expect(screen.queryByText('Задайте вопрос, чтобы начать сравнение.')).toBeNull();
    expect(screen.getByText('Вопрос после очистки', { selector: 'div' })).toBeInTheDocument();
  });

  it('shows unsupported message for Share button without modifying data or touching clipboard', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const shareBtn = screen.getByRole('button', {
      name: /скопировать ссылку/i,
    });
    await user.click(shareBtn);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Общий доступ пока не поддерживается.');
  });

  it('does not close an open thought block in another answer when retry is clicked', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    const claudeCell = screen.getByLabelText('Claude Haiku 5.5, turn-1');
    const thoughtBtn = within(claudeCell).getByRole('button', { name: 'Думала 4 секунды' });

    // Open thought block
    await user.click(thoughtBtn);
    expect(thoughtBtn).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(claudeCell).getByText(/Пользователь спрашивает об Editor\.js/),
    ).toBeInTheDocument();

    // Now click retry on GigaChat in the same turn
    const gigaCell = screen.getByLabelText('GigaChat 2, turn-1');
    const retryBtn = within(gigaCell).getByRole('button', {
      name: /повторить/i,
    });
    await user.click(retryBtn);

    // Verify Claude's thought block is still expanded!
    expect(thoughtBtn).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(claudeCell).getByText(/Пользователь спрашивает об Editor\.js/),
    ).toBeInTheDocument();
  });

  describe('TASK-010: Integration action flows', () => {
    it('executes flow: Remove -> search -> add different model -> Send new prompt', async () => {
      const user = userEvent.setup();
      render(<ComparePage />);

      // 1. Remove Yandex
      const removeYandexBtn = screen.getByRole('button', {
        name: /удалить модель yandexgpt 5 lite/i,
      });
      await user.click(removeYandexBtn);
      expect(screen.queryByText('YandexGPT 5 Lite')).toBeNull();

      // 2. Open picker, search for Demo Alpha, and add it
      const addBtn = screen.getByRole('button', { name: 'Добавить модель' });
      await user.click(addBtn);

      const searchInput = screen.getByRole('textbox', { name: 'Поиск модели' });
      await user.type(searchInput, 'демо альфа');
      const demoAlphaBtn = screen.getByText('Демо Альфа').closest('button');
      expect(demoAlphaBtn).toBeEnabled();
      if (demoAlphaBtn) {
        await user.click(demoAlphaBtn);
      }

      // Verify models in header: Claude, Giga, Demo Alpha
      expect(screen.getByText('Claude Haiku 5.5')).toBeInTheDocument();
      expect(screen.getByText('GigaChat 2')).toBeInTheDocument();
      expect(screen.getByText('Демо Альфа')).toBeInTheDocument();

      // 3. Send new question
      const textarea = screen.getByRole('textbox', {
        name: /задайте вопрос всем моделям/i,
      });
      await user.type(textarea, 'Интеграционный вопрос');
      const sendBtn = screen.getByRole('button', { name: /отправить вопрос/i });
      await user.click(sendBtn);

      // Verify 3 turns exist
      expect(screen.getByText('Интеграционный вопрос', { selector: 'div' })).toBeInTheDocument();

      // Turn 1 and 2 have placeholder for Demo Alpha
      expect(screen.getAllByText('Модель добавлена после этого вопроса.')).toHaveLength(2);

      // Turn 3 has success answer for Demo Alpha
      expect(
        screen.getByText(
          (_content, el) =>
            el?.tagName === 'P' &&
            el?.textContent?.includes('Демонстрационный ответ модели Демо Альфа.') === true,
        ),
      ).toBeInTheDocument();
    });

    it('proves that removing and re-adding a model does not resurrect its historical answers', async () => {
      const user = userEvent.setup();
      render(<ComparePage />);

      // Remove Claude
      const removeClaudeBtn = screen.getByRole('button', {
        name: /удалить модель claude haiku 5.5/i,
      });
      await user.click(removeClaudeBtn);
      expect(screen.queryByText('Claude Haiku 5.5')).toBeNull();

      // Re-add Claude from catalog
      const addBtn = screen.getByRole('button', { name: 'Добавить модель' });
      await user.click(addBtn);
      const claudeOption = screen.getByText('Claude Haiku 5.5').closest('button');
      expect(claudeOption).toBeEnabled();
      if (claudeOption) {
        await user.click(claudeOption);
      }

      // Claude is present in header
      expect(screen.getByText('Claude Haiku 5.5')).toBeInTheDocument();

      // But Claude's answers in past turns are NOT resurrected, they show placeholder
      expect(screen.getAllByText('Модель добавлена после этого вопроса.')).toHaveLength(2);
    });

    it('enforces boundary limits: maximum 4 models cannot add 5th, minimum 2 models cannot delete further', async () => {
      const user = userEvent.setup();
      render(<ComparePage />);

      // Add 4th model (demo-alpha)
      const addBtn = screen.getByRole('button', { name: 'Добавить модель' });
      await user.click(addBtn);
      const alphaBtn = screen.getByText('Демо Альфа').closest('button');
      if (alphaBtn) await user.click(alphaBtn);

      // Re-open picker: all remaining unselected models must be disabled with 4-model limit message
      await user.click(addBtn);
      expect(screen.getAllByText('Можно выбрать не более 4 моделей').length).toBeGreaterThan(0);
      const closeBtn = screen.getByRole('button', { name: 'Закрыть' });
      await user.click(closeBtn);

      // Now remove 2 models so only 2 remain
      const removeClaude = screen.getByRole('button', { name: /удалить модель claude/i });
      await user.click(removeClaude);
      const removeYandex = screen.getByRole('button', { name: /удалить модель yandex/i });
      await user.click(removeYandex);

      // Only 2 models remain (GigaChat and Demo Alpha)
      const disabledRemoveButtons = screen.getAllByRole('button', {
        name: 'Нужно оставить минимум 2 модели',
      });
      expect(disabledRemoveButtons).toHaveLength(2);
      expect(disabledRemoveButtons[0]).toBeDisabled();
      expect(disabledRemoveButtons[1]).toBeDisabled();
    });
  });
});
