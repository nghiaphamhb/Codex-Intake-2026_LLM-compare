import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddModelColumn } from './AddModelColumn';

describe('AddModelColumn', () => {
  it('renders a native button with accessible name "Добавить модель"', () => {
    render(<AddModelColumn onAdd={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Добавить модель' });
    expect(button).toBeInTheDocument();
    expect(button.tagName.toLowerCase()).toBe('button');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('calls onAdd when clicked anywhere in the column', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddModelColumn onAdd={onAdd} />);

    const button = screen.getByRole('button', { name: 'Добавить модель' });
    await user.click(button);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('calls onAdd when activated via keyboard (Enter or Space)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddModelColumn onAdd={onAdd} />);

    const button = screen.getByRole('button', { name: 'Добавить модель' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it('passes native disabled attribute and does not fire onAdd when disabled', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddModelColumn onAdd={onAdd} disabled={true} />);

    const button = screen.getByRole('button', { name: 'Добавить модель' });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
