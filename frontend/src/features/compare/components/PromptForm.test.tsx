import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptForm } from './PromptForm';

describe('PromptForm', () => {
  it('renders textarea with placeholder and controlled value', () => {
    render(
      <PromptForm
        value="Hello models"
        onValueChange={() => {}}
        busy={false}
        onSend={() => {}}
        onStop={() => {}}
      />,
    );

    const textarea = screen.getByPlaceholderText('Задайте вопрос всем моделям');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('Hello models');
    expect(textarea).not.toBeDisabled();
  });

  it('calls onValueChange when typing in textarea', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();

    render(
      <PromptForm
        value=""
        onValueChange={handleValueChange}
        busy={false}
        onSend={() => {}}
        onStop={() => {}}
      />,
    );

    const textarea = screen.getByPlaceholderText('Задайте вопрос всем моделям');
    await user.type(textarea, 'A');

    expect(handleValueChange).toHaveBeenCalledWith('A');
  });

  it('disables send button and prevents onSend when value is empty or only whitespace', async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();

    const { rerender } = render(
      <PromptForm
        value=""
        onValueChange={() => {}}
        busy={false}
        onSend={handleSend}
        onStop={() => {}}
      />,
    );

    const sendBtn = screen.getByRole('button', { name: /отправить/i });
    expect(sendBtn).toBeDisabled();

    // Whitespace only
    rerender(
      <PromptForm
        value={'   \n\t  '}
        onValueChange={() => {}}
        busy={false}
        onSend={handleSend}
        onStop={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /отправить/i })).toBeDisabled();

    const textarea = screen.getByPlaceholderText('Задайте вопрос всем моделям');
    await user.type(textarea, '{Enter}');
    expect(handleSend).not.toHaveBeenCalled();
  });

  it('submits form on click or Enter and preserves exact value without trimming', async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();
    const rawValue = '  first line  \n  second line  ';

    render(
      <PromptForm
        value={rawValue}
        onValueChange={() => {}}
        busy={false}
        onSend={handleSend}
        onStop={() => {}}
      />,
    );

    const sendBtn = screen.getByRole('button', { name: /отправить/i });
    expect(sendBtn).not.toBeDisabled();
    expect(sendBtn).toHaveAttribute('type', 'submit');

    await user.click(sendBtn);
    expect(handleSend).toHaveBeenCalledWith(rawValue);

    // Also via Enter
    const textarea = screen.getByPlaceholderText('Задайте вопрос всем моделям');
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    expect(handleSend).toHaveBeenCalledTimes(2);
    expect(handleSend).toHaveBeenLastCalledWith(rawValue);
  });

  it('does not send on Shift+Enter (allows newline)', () => {
    const handleSend = vi.fn();

    render(
      <PromptForm
        value="Multi line query"
        onValueChange={() => {}}
        busy={false}
        onSend={handleSend}
        onStop={() => {}}
      />,
    );

    const textarea = screen.getByPlaceholderText('Задайте вопрос всем моделям');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(handleSend).not.toHaveBeenCalled();
  });

  it('does not send on Enter while IME composition is active or keyCode is 229', () => {
    const handleSend = vi.fn();

    render(
      <PromptForm
        value="Input with IME"
        onValueChange={() => {}}
        busy={false}
        onSend={handleSend}
        onStop={() => {}}
      />,
    );

    const textarea = screen.getByPlaceholderText('Задайте вопрос всем моделям');

    // 1. Composition event active
    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(handleSend).not.toHaveBeenCalled();

    fireEvent.compositionEnd(textarea);

    // 2. keyCode 229
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 });
    expect(handleSend).not.toHaveBeenCalled();

    // 3. nativeEvent.isComposing = true
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });
    expect(handleSend).not.toHaveBeenCalled();
  });

  it('switches to Stop button when busy, keeps textarea editable, and Enter does not send', async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();
    const handleStop = vi.fn();

    render(
      <PromptForm
        value="Long running prompt"
        onValueChange={() => {}}
        busy={true}
        onSend={handleSend}
        onStop={handleStop}
      />,
    );

    const textarea = screen.getByPlaceholderText('Задайте вопрос всем моделям');
    expect(textarea).not.toBeDisabled();

    // Enter while busy does not send
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(handleSend).not.toHaveBeenCalled();

    // Stop button is present with type="button"
    const stopBtn = screen.getByRole('button', { name: /остановить/i });
    expect(stopBtn).toBeInTheDocument();
    expect(stopBtn).toHaveAttribute('type', 'button');

    await user.click(stopBtn);
    expect(handleStop).toHaveBeenCalledTimes(1);
    expect(handleSend).not.toHaveBeenCalled();
  });
});

describe('PromptForm sizing regressions', () => {
  it('remeasures when the container width or font metrics change and disconnects on unmount', async () => {
    let resized!: ResizeObserverCallback;
    const disconnect = vi.fn();
    class Observer {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', Observer);
    let fontsReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      fontsReady = resolve;
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
    let height = 22;
    let width = 300;
    const rect = vi
      .spyOn(HTMLTextAreaElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({ width }) as DOMRect);
    const measured = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(() => height);
    try {
      const { unmount } = render(
        <PromptForm
          value="same text"
          onValueChange={() => {}}
          busy={false}
          onSend={() => {}}
          onStop={() => {}}
        />,
      );
      const input = screen.getByRole('textbox');
      expect(input.style.height).toBe('36px');
      height = 88;
      act(() => {
        width -= 10;
        resized([], {} as ResizeObserver);
      });
      expect(input.style.height).toBe('88px');
      height = 110;
      await act(async () => {
        fontsReady();
        await ready;
      });
      expect(input.style.height).toBe('110px');
      height = 200;
      act(() => {
        width -= 10;
        resized([], {} as ResizeObserver);
      });
      expect(input.style.height).toBe('160px');
      expect(input.style.overflowY).toBe('auto');
      height = 22;
      act(() => {
        width -= 10;
        resized([], {} as ResizeObserver);
      });
      expect(input.style.height).toBe('36px');
      expect(input.style.overflowY).toBe('hidden');
      unmount();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      measured.mockRestore();
      rect.mockRestore();
      vi.unstubAllGlobals();
      Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('assigns the textarea DOM node to optional inputRef when provided', () => {
    const ref = { current: null as HTMLTextAreaElement | null };
    render(
      <PromptForm
        value=""
        onValueChange={() => {}}
        busy={false}
        onSend={() => {}}
        onStop={() => {}}
        inputRef={ref}
      />,
    );

    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    expect(ref.current).toBe(screen.getByRole('textbox'));
  });

  it('disables send button, blocks submit and enter when disabled=true while textarea remains editable', async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();
    const handleValueChange = vi.fn();

    render(
      <PromptForm
        value="Valid question"
        onValueChange={handleValueChange}
        busy={false}
        disabled={true}
        onSend={handleSend}
        onStop={() => {}}
      />,
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).not.toBeDisabled();

    const sendBtn = screen.getByRole('button', { name: 'Отправить вопрос' });
    expect(sendBtn).toBeDisabled();

    // Click submit
    await user.click(sendBtn);
    expect(handleSend).not.toHaveBeenCalled();

    // Press Enter
    await user.type(textarea, '{Enter}');
    expect(handleSend).not.toHaveBeenCalled();

    // Typing still triggers onValueChange
    await user.type(textarea, 'a');
    expect(handleValueChange).toHaveBeenCalled();
  });
});
