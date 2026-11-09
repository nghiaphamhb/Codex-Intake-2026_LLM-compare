import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeBlock } from './CodeBlock';

describe('CodeBlock', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders language header and defaults to "text" when language is missing', () => {
    const { rerender } = render(<CodeBlock code="const a = 1;" language="typescript" />);
    expect(screen.getByText('typescript')).toBeInTheDocument();

    rerender(<CodeBlock code="plain text" />);
    expect(screen.getByText('text')).toBeInTheDocument();
  });

  it('preserves exact code content including leading/trailing whitespace and newlines', () => {
    const rawCode = '  function test() {\n    return 42;\n  }\n';
    const { container } = render(<CodeBlock code={rawCode} language="javascript" />);
    expect(container.textContent).toContain(rawCode);
  });

  it('renders plain text for languages outside js/ts/json without guessing', () => {
    const pythonCode = 'def hello():\n    print("world")';
    const { container } = render(<CodeBlock code={pythonCode} language="python" />);
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(container.textContent).toContain(pythonCode);
  });

  it('copies exact code to clipboard and shows "Скопировано"', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const code = 'line 1\n  line 2\n';
    render(<CodeBlock code={code} language="json" />);

    const copyBtn = screen.getByRole('button', { name: /копировать/i });
    await user.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith(code);
    await waitFor(() => {
      expect(screen.getByText('Скопировано')).toBeInTheDocument();
    });
  });

  it('disables button while copy promise is pending', async () => {
    const user = userEvent.setup();
    let resolvePromise: () => void = () => {};
    const pendingPromise = new Promise<void>((res) => {
      resolvePromise = res;
    });
    const writeText = vi.fn().mockReturnValue(pendingPromise);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<CodeBlock code="sample code" language="ts" />);
    const copyBtn = screen.getByRole('button', { name: /копировать/i });

    await user.click(copyBtn);
    expect(copyBtn).toBeDisabled();

    resolvePromise();
    await waitFor(() => {
      expect(screen.getByText('Скопировано')).toBeInTheDocument();
    });
  });

  it('shows "Не удалось скопировать" and allows retry when clipboard rejects', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<CodeBlock code="error code" language="js" />);
    const copyBtn = screen.getByRole('button', { name: /копировать/i });

    await user.click(copyBtn);

    await waitFor(() => {
      expect(screen.getByText('Не удалось скопировать')).toBeInTheDocument();
    });
    expect(copyBtn).not.toBeDisabled();
  });

  it('shows "Не удалось скопировать" when navigator.clipboard API is missing', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    render(<CodeBlock code="no clipboard" language="js" />);
    const copyBtn = screen.getByRole('button', { name: /копировать/i });

    await user.click(copyBtn);

    await waitFor(() => {
      expect(screen.getByText('Не удалось скопировать')).toBeInTheDocument();
    });
    expect(copyBtn).not.toBeDisabled();
  });

  it('clears feedback message when code prop changes', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const { rerender } = render(<CodeBlock code="version 1" language="ts" />);
    const copyBtn = screen.getByRole('button', { name: /копировать/i });

    await user.click(copyBtn);
    await waitFor(() => {
      expect(screen.getByText('Скопировано')).toBeInTheDocument();
    });

    // Change code prop
    rerender(<CodeBlock code="version 2" language="ts" />);
    expect(screen.queryByText('Скопировано')).toBeNull();
    expect(screen.getByRole('button', { name: /копировать/i })).toBeInTheDocument();
  });
});


describe('CodeBlock regressions', () => {
  it.each(['first\n\nthird\n', '\n\n', '', '  x\n\n  y\n\n', 'a\r\n\r\nb\r\n'])('renders exact highlighted text %j', (code) => {
    const { container } = render(<CodeBlock code={code} language="ts" />);
    expect(container.querySelector('pre code')?.textContent).toBe(code);
  });

  it.each(['resolve', 'reject'])('ignores an old clipboard %s while a newer copy is pending', async (outcome) => {
    const user = userEvent.setup();
    let resolveOld!: () => void;
    let rejectOld!: (error: Error) => void;
    let resolveNew!: () => void;
    const old = new Promise<void>((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
    const current = new Promise<void>((resolve) => { resolveNew = resolve; });
    const writeText = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(current);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { rerender } = render(<CodeBlock code="old" />);
    await user.click(screen.getByRole('button', { name: 'Копировать' }));
    rerender(<CodeBlock code="new" />);
    await user.click(screen.getByRole('button', { name: 'Копировать' }));
    await act(async () => {
      if (outcome === 'resolve') resolveOld(); else rejectOld(new Error('old failure'));
      await old.catch(() => {});
    });
    expect(screen.getByRole('button', { name: 'Копировать' })).toBeDisabled();
    expect(screen.queryByText('Скопировано')).not.toBeInTheDocument();
    expect(screen.queryByText('Не удалось скопировать')).not.toBeInTheDocument();
    await act(async () => { resolveNew(); await current; });
    expect(screen.getByRole('button', { name: 'Скопировано' })).toBeEnabled();
    expect(writeText.mock.calls).toEqual([['old'], ['new']]);
  });
});
