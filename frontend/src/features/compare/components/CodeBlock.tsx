import { useState } from 'react';
import { Highlight } from 'prism-react-renderer';
import styles from './CodeBlock.module.css';

export type CodeBlockProps = {
  code: string;
  language?: string;
  className?: string;
};

type CopyStatus = 'idle' | 'copying' | 'success' | 'error';

const codeTheme = {
  plain: {
    color: 'var(--color-text-code)',
    backgroundColor: 'transparent',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'doctype', 'cdata'],
      style: { color: 'var(--color-text-secondary)', fontStyle: 'italic' as const },
    },
    {
      types: ['string', 'attr-value', 'char'],
      style: { color: '#a5d6ff' },
    },
    {
      types: ['punctuation', 'operator'],
      style: { color: '#e6e6e6' },
    },
    {
      types: ['keyword', 'tag'],
      style: { color: '#ff7b72' },
    },
    {
      types: ['function', 'class-name'],
      style: { color: '#d2a8ff' },
    },
    {
      types: ['boolean', 'number', 'constant'],
      style: { color: '#79c0ff' },
    },
    {
      types: ['property', 'variable'],
      style: { color: '#7ee787' },
    },
  ],
};

function normalizeLanguage(lang?: string): string {
  if (!lang) return 'text';
  const trimmed = lang.trim().toLowerCase();
  return trimmed || 'text';
}

function getHighlightLanguage(normalized: string): 'javascript' | 'typescript' | 'json' | null {
  if (normalized === 'js' || normalized === 'javascript') return 'javascript';
  if (normalized === 'ts' || normalized === 'typescript') return 'typescript';
  if (normalized === 'json') return 'json';
  return null;
}

export function CodeBlock(props: CodeBlockProps) {
  // A new code value owns its clipboard state; old promises cannot update it.
  return <CodeBlockContent key={props.code} {...props} />;
}

function CodeBlockContent({ code, language, className }: CodeBlockProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const normalizedLang = normalizeLanguage(language);
  const highlightLang = getHighlightLanguage(normalizedLang);
  const lineBreaks = code.match(/\r\n|\r|\n/g) ?? [];

  const handleCopy = async () => {
    if (status === 'copying') return;
    setStatus('copying');
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(code);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  const buttonText =
    status === 'success'
      ? 'Скопировано'
      : status === 'error'
      ? 'Не удалось скопировать'
      : 'Копировать';

  return (
    <div className={`${styles.container} ${className || ''}`}>
      <div className={styles.header}>
        <span className={styles.language}>{normalizedLang}</span>
        <div className={styles.copyArea} aria-live="polite">
          <button
            type="button"
            className={styles.copyButton}
            onClick={handleCopy}
            disabled={status === 'copying'}
          >
            <img src="/assets/icons/copy.svg" alt="" />
            {buttonText}
          </button>
        </div>
      </div>
      {highlightLang ? (
        <Highlight theme={codeTheme} code={code} language={highlightLang}>
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={`${styles.pre} ${className}`} style={style}>
              <code className={styles.code}>
                {tokens.map((line, i) => (
                  <span key={i} {...getLineProps({ line })} className={styles.line}>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })}>{token.empty ? '' : token.content}</span>
                    ))}
                    {lineBreaks[i] ?? ''}
                  </span>
                ))}
              </code>
            </pre>
          )}
        </Highlight>
      ) : (
        <pre className={styles.pre}>
          <code className={styles.code}>{code}</code>
        </pre>
      )}
    </div>
  );
}

