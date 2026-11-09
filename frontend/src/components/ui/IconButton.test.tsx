import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('renders with accessible name from label and alt="" on inner image', () => {
    render(<IconButton label="Close panel" iconSrc="/assets/icons/close.svg" />);
    const button = screen.getByRole('button', { name: 'Close panel' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-label', 'Close panel');

    const image = button.querySelector('img');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', '/assets/icons/close.svg');
    expect(image).toHaveAttribute('alt', '');
  });

  it('allows overriding type with "submit"', () => {
    render(<IconButton label="Send" iconSrc="/assets/icons/send.svg" type="submit" />);
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('calls onClick when clicked or activated by keyboard', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<IconButton label="Copy" iconSrc="/assets/icons/copy.svg" onClick={handleClick} />);

    const button = screen.getByRole('button', { name: 'Copy' });
    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);

    button.focus();
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<IconButton disabled label="Copy" iconSrc="/assets/icons/copy.svg" onClick={handleClick} />);

    const button = screen.getByRole('button', { name: 'Copy' });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not submit parent form by default', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={handleSubmit}>
        <IconButton label="Action" iconSrc="/assets/icons/plus.svg" />
      </form>
    );

    await user.click(screen.getByRole('button', { name: 'Action' }));
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});

