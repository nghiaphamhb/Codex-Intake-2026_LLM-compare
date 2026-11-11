import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompareModel } from '../types';
import { ModelPicker } from './ModelPicker';

const mockCatalog: readonly CompareModel[] = [
  { id: 'm-1', name: 'Claude Haiku 5.5', provider: 'Anthropic' },
  { id: 'm-2', name: 'YandexGPT 5 Lite', provider: 'Яндекс' },
  { id: 'm-3', name: 'GigaChat 2', provider: 'Сбер' },
  { id: 'm-4', name: 'Демо Альфа', provider: 'Демо' },
  { id: 'm-5', name: 'Демо Бета', provider: 'Демо' },
];

describe('ModelPicker', () => {
  beforeEach(() => {
    // Provide standard HTMLDialogElement polyfill for jsdom
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

  it('renders modal title, search input, and close button', () => {
    render(
      <ModelPicker
        catalog={mockCatalog}
        selectedModelIds={['m-1']}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Добавить модель' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Поиск модели' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
  });

  it('renders catalog models with name and provider', () => {
    render(
      <ModelPicker
        catalog={mockCatalog}
        selectedModelIds={[]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    for (const model of mockCatalog) {
      expect(screen.getByText(model.name)).toBeInTheDocument();
      expect(screen.getAllByText(model.provider).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('filters models by name or provider with case-insensitivity and trimming', async () => {
    const user = userEvent.setup();
    render(
      <ModelPicker
        catalog={mockCatalog}
        selectedModelIds={[]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const searchInput = screen.getByRole('textbox', { name: 'Поиск модели' });

    // Search by partial provider name in lowercase with spaces
    await user.type(searchInput, '  яндекс  ');
    expect(screen.getByText('YandexGPT 5 Lite')).toBeInTheDocument();
    expect(screen.queryByText('Claude Haiku 5.5')).not.toBeInTheDocument();

    // Clear and search by model name
    await user.clear(searchInput);
    await user.type(searchInput, 'haiku');
    expect(screen.getByText('Claude Haiku 5.5')).toBeInTheDocument();
    expect(screen.queryByText('GigaChat 2')).not.toBeInTheDocument();
  });

  it('shows empty message when no models match the query', async () => {
    const user = userEvent.setup();
    render(
      <ModelPicker
        catalog={mockCatalog}
        selectedModelIds={[]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const searchInput = screen.getByRole('textbox', { name: 'Поиск модели' });
    await user.type(searchInput, 'non-existent-query-xyz');

    expect(screen.getByText('Модели не найдены.')).toBeInTheDocument();
  });

  it('disables already selected models with "Уже добавлена" tag and prevents selection', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelPicker
        catalog={mockCatalog}
        selectedModelIds={['m-1']}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Уже добавлена')).toBeInTheDocument();
    const claudeButton = screen.getByText('Claude Haiku 5.5').closest('button');
    expect(claudeButton).toBeDisabled();

    if (claudeButton) {
      await user.click(claudeButton);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disables unselected models with "Можно выбрать не более 4 моделей" when 4 models are already selected', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelPicker
        catalog={mockCatalog}
        selectedModelIds={['m-1', 'm-2', 'm-3', 'm-4']}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Уже добавлена')).toHaveLength(4);
    expect(screen.getByText('Можно выбрать не более 4 моделей')).toBeInTheDocument();

    const betaButton = screen.getByText('Демо Бета').closest('button');
    expect(betaButton).toBeDisabled();

    if (betaButton) {
      await user.click(betaButton);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onSelect with model ID when clicking an available model', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelPicker
        catalog={mockCatalog}
        selectedModelIds={['m-1', 'm-2']}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    const gigaButton = screen.getByText('GigaChat 2').closest('button');
    expect(gigaButton).toBeEnabled();

    if (gigaButton) {
      await user.click(gigaButton);
    }
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('m-3');
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelPicker
        catalog={mockCatalog}
        selectedModelIds={[]}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    const closeButton = screen.getByRole('button', { name: 'Закрыть' });
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when dialog fires cancel event (Escape key)', () => {
    const onClose = vi.fn();
    render(
      <ModelPicker
        catalog={mockCatalog}
        selectedModelIds={[]}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
