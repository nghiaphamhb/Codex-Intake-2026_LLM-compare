import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileModelTabs } from './MobileModelTabs';
import type { CompareModel, CompareTurn } from '../types';

const mockModels: CompareModel[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'gemini-1-5-pro', name: 'Gemini 1.5 Pro', provider: 'Google' },
];

describe('MobileModelTabs', () => {
  it('renders tablist and tabs with correct roles, attributes, and convention IDs', () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();

    render(
      <MobileModelTabs
        models={mockModels}
        activeModelId="claude-3-5-sonnet"
        idPrefix="grid-turn-1"
        answers={{}}
        onSelectModel={onSelect}
        onAddModel={onAdd}
      />,
    );

    const tablist = screen.getByRole('tablist', { name: 'Модели для сравнения' });
    expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);

    // First tab (unselected)
    expect(tabs[0]).toHaveAttribute('id', 'grid-turn-1-tab-0');
    expect(tabs[0]).toHaveAttribute('aria-controls', 'grid-turn-1-panel-0');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[0]).toHaveAttribute('tabindex', '-1');
    expect(tabs[0]).toHaveAttribute('aria-label', 'GPT-4o (OpenAI)');

    // Second tab (selected)
    expect(tabs[1]).toHaveAttribute('id', 'grid-turn-1-tab-1');
    expect(tabs[1]).toHaveAttribute('aria-controls', 'grid-turn-1-panel-1');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('aria-label', 'Claude 3.5 Sonnet (Anthropic)');

    // Third tab (unselected)
    expect(tabs[2]).toHaveAttribute('id', 'grid-turn-1-tab-2');
    expect(tabs[2]).toHaveAttribute('aria-controls', 'grid-turn-1-panel-2');
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[2]).toHaveAttribute('tabindex', '-1');
  });

  it('renders status labels accurately for each answer state', () => {
    const answers: CompareTurn['answers'] = {
      'gpt-4o': { state: 'pending', requestId: 'req-1' },
      'claude-3-5-sonnet': {
        state: 'streaming',
        requestId: 'req-2',
        markdown: 'partial',
        reasoning: '',
      },
      'gemini-1-5-pro': {
        state: 'success',
        markdown: 'done',
        durationLabel: '1.2s',
      },
    };

    render(
      <MobileModelTabs
        models={mockModels}
        activeModelId="gpt-4o"
        idPrefix="test"
        answers={answers}
        onSelectModel={vi.fn()}
        onAddModel={vi.fn()}
      />,
    );

    expect(screen.getByText('Ждём…')).toBeInTheDocument();
    expect(screen.getByText('Получаем…')).toBeInTheDocument();
    expect(screen.getByText('1.2s')).toBeInTheDocument();
  });

  it('renders error, stopped, and missing status labels', () => {
    const answers: CompareTurn['answers'] = {
      'gpt-4o': { state: 'error', message: 'fail', description: 'err' },
      'claude-3-5-sonnet': {
        state: 'stopped',
        requestId: 'req-2',
        markdown: '',
        reasoning: '',
      },
      // gemini-1-5-pro missing from answers
    };

    render(
      <MobileModelTabs
        models={mockModels}
        activeModelId="gpt-4o"
        idPrefix="test"
        answers={answers}
        onSelectModel={vi.fn()}
        onAddModel={vi.fn()}
      />,
    );

    expect(screen.getByText('Ошибка')).toBeInTheDocument();
    expect(screen.getByText('Остановлено')).toBeInTheDocument();
    expect(screen.getByText('Нет ответа')).toBeInTheDocument();
  });

  it('does not render status labels when conversation is empty', () => {
    render(
      <MobileModelTabs
        models={mockModels}
        activeModelId="gpt-4o"
        idPrefix="test"
        answers={{}}
        onSelectModel={vi.fn()}
        onAddModel={vi.fn()}
      />,
    );

    expect(screen.queryByText('Нет ответа')).not.toBeInTheDocument();
    expect(screen.queryByText('Ждём…')).not.toBeInTheDocument();
  });

  it('handles click to select model', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <MobileModelTabs
        models={mockModels}
        activeModelId="gpt-4o"
        idPrefix="test"
        answers={{}}
        onSelectModel={onSelect}
        onAddModel={vi.fn()}
      />,
    );

    const tabs = screen.getAllByRole('tab');
    await user.click(tabs[1]);
    expect(onSelect).toHaveBeenCalledWith('claude-3-5-sonnet');
  });

  it('navigates with ArrowRight and ArrowLeft with wrapping', () => {
    const onSelect = vi.fn();

    render(
      <MobileModelTabs
        models={mockModels}
        activeModelId="gemini-1-5-pro" // Last item (index 2)
        idPrefix="test"
        answers={{}}
        onSelectModel={onSelect}
        onAddModel={vi.fn()}
      />,
    );

    const tabs = screen.getAllByRole('tab');

    // ArrowRight on last tab wraps to first (index 0)
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith('gpt-4o');

    // ArrowLeft on last tab moves to prev (index 1)
    fireEvent.keyDown(tabs[2], { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenCalledWith('claude-3-5-sonnet');
  });

  it('navigates with Home and End keys', () => {
    const onSelect = vi.fn();

    render(
      <MobileModelTabs
        models={mockModels}
        activeModelId="claude-3-5-sonnet" // index 1
        idPrefix="test"
        answers={{}}
        onSelectModel={onSelect}
        onAddModel={vi.fn()}
      />,
    );

    const tabs = screen.getAllByRole('tab');

    fireEvent.keyDown(tabs[1], { key: 'Home' });
    expect(onSelect).toHaveBeenCalledWith('gpt-4o');

    fireEvent.keyDown(tabs[1], { key: 'End' });
    expect(onSelect).toHaveBeenCalledWith('gemini-1-5-pro');
  });

  it('does not prevent default on Tab key', () => {
    render(
      <MobileModelTabs
        models={mockModels}
        activeModelId="gpt-4o"
        idPrefix="test"
        answers={{}}
        onSelectModel={vi.fn()}
        onAddModel={vi.fn()}
      />,
    );

    const tab = screen.getAllByRole('tab')[0];
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    tab.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('places Add button outside tablist and passes event.currentTarget on click', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();

    render(
      <MobileModelTabs
        models={mockModels}
        activeModelId="gpt-4o"
        idPrefix="test"
        answers={{}}
        onSelectModel={vi.fn()}
        onAddModel={onAdd}
        addDisabled={false}
      />,
    );

    const addBtn = screen.getByRole('button', { name: 'Добавить модель' });
    expect(addBtn.closest('[role="tablist"]')).toBeNull();

    await user.click(addBtn);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toBe(addBtn);
  });

  it('disables Add button when addDisabled is true', () => {
    render(
      <MobileModelTabs
        models={mockModels}
        activeModelId="gpt-4o"
        idPrefix="test"
        answers={{}}
        onSelectModel={vi.fn()}
        onAddModel={vi.fn()}
        addDisabled={true}
      />,
    );

    const addBtn = screen.getByRole('button', { name: 'Добавить модель' });
    expect(addBtn).toBeDisabled();
  });
});
