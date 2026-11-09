import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThoughtStatus } from './ThoughtStatus';

describe('ThoughtStatus', () => {
  it('renders "Думает…" for thinking state and "Готово" or "Думала {n} с" for done state', () => {
    const { rerender } = render(<ThoughtStatus state="thinking" />);
    expect(screen.getByText('Думает…')).toBeInTheDocument();

    rerender(<ThoughtStatus state="done" durationSeconds={3} />);
    expect(screen.getByText('Думала 3 с')).toBeInTheDocument();

    rerender(<ThoughtStatus state="done" />);
    expect(screen.getByText('Готово')).toBeInTheDocument();
  });

  it('does not render toggle button when text is empty or missing', () => {
    const { rerender } = render(<ThoughtStatus state="thinking" />);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<ThoughtStatus state="thinking" text="   " />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders toggle button when text is present, starts closed, and has accessible attributes', async () => {
    const user = userEvent.setup();
    const thoughtText = 'Evaluating approaches...\nChoosing solution.';
    const { container } = render(<ThoughtStatus state="thinking" text={thoughtText} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    const controlsId = button.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    // Content is initially not visible or collapsed
    expect(container.textContent).not.toContain(thoughtText);

    // Click to open
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(container.textContent).toContain(thoughtText);

    // Click to close
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(container.textContent).not.toContain(thoughtText);
  });

  it('generates distinct IDs for multiple instances', () => {
    render(
      <>
        <ThoughtStatus state="thinking" text="Thought 1" />
        <ThoughtStatus state="thinking" text="Thought 2" />
      </>
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);

    const id1 = buttons[0].getAttribute('aria-controls');
    const id2 = buttons[1].getAttribute('aria-controls');

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('preserves user open state when state prop transitions from thinking to done', async () => {
    const user = userEvent.setup();
    const thoughtText = 'Ongoing analysis...';
    const { container, rerender } = render(<ThoughtStatus state="thinking" text={thoughtText} />);

    const button = screen.getByRole('button');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(container.textContent).toContain(thoughtText);

    // Transition to done
    rerender(<ThoughtStatus state="done" durationSeconds={5} text={thoughtText} />);
    const updatedButton = screen.getByRole('button');
    expect(updatedButton).toHaveAttribute('aria-expanded', 'true');
    expect(container.textContent).toContain(thoughtText);
  });
});
