import {
  useRef,
  useLayoutEffect,
  useId,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { IconButton } from '../../../components/ui/IconButton';
import styles from './PromptForm.module.css';

export type PromptFormProps = {
  value: string;
  onValueChange: (value: string) => void;
  busy: boolean;
  disabled?: boolean;
  onSend: (prompt: string) => void;
  onStop: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  error?: string;
};

export function PromptForm({
  value,
  onValueChange,
  busy,
  disabled = false,
  onSend,
  onStop,
  inputRef,
  error,
}: PromptFormProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef || internalRef;
  const isComposingRef = useRef(false);
  const inputId = useId();
  const errorId = `${inputId}-error`;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    let active = true;
    let lastWidth = textarea.getBoundingClientRect().width;
    const resize = () => {
      if (!active) return;
      // Reset below the native rows height before measuring wrapped text.
      textarea.style.height = '0px';
      const height = textarea.scrollHeight;
      textarea.style.height = `${Math.min(Math.max(height, 36), 160)}px`;
      textarea.style.overflowY = height > 160 ? 'auto' : 'hidden';
    };
    resize();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            const width = textarea.getBoundingClientRect().width;
            if (width !== lastWidth) {
              lastWidth = width;
              resize();
            }
          });
    observer?.observe(textarea);
    void document.fonts?.ready.then(resize);
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [value, textareaRef]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || disabled) return;
    if (value.trim().length === 0) return;
    onSend(value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (
        e.nativeEvent.isComposing ||
        isComposingRef.current ||
        (e as unknown as { isComposing?: boolean }).isComposing ||
        e.keyCode === 229
      ) {
        return;
      }

      e.preventDefault();

      if (busy || disabled) return;
      if (value.trim().length === 0) return;

      onSend(value);
    }
  };

  const isSendDisabled = disabled || value.trim().length === 0;

  return (
    <>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label htmlFor={inputId} className={styles.visuallyHidden}>
          Задайте вопрос всем моделям
        </label>
        <textarea
          id={inputId}
          ref={textareaRef}
          className={styles.textarea}
          placeholder="Задайте вопрос всем моделям"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
        />
        <div className={styles.actionButton}>
          {busy ? (
            <IconButton
              className={styles.sendButton}
              type="button"
              label="Остановить генерацию"
              iconSrc="/assets/icons/stop.svg"
              onClick={onStop}
            />
          ) : (
            <IconButton
              className={styles.sendButton}
              type="submit"
              label="Отправить вопрос"
              iconSrc="/assets/icons/send.svg"
              disabled={isSendDisabled}
            />
          )}
        </div>
      </form>
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </>
  );
}
