import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import styles from './AnswerContent.module.css';

export type AnswerContentProps = {
  markdown: string;
};

export function AnswerContent({ markdown }: AnswerContentProps) {
  return (
    <div className={styles.content}>
      <ReactMarkdown
        skipHtml={true}
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            if (React.isValidElement(children)) {
              const codeProps = children.props as { className?: string; children?: unknown };
              const match = /language-([a-zA-Z0-9_-]+)/.exec(codeProps.className || '');
              const language = match ? match[1] : undefined;
              const rawCode =
                typeof codeProps.children === 'string'
                  ? codeProps.children
                  : Array.isArray(codeProps.children)
                  ? codeProps.children.join('')
                  : String(codeProps.children ?? '');
              return <CodeBlock code={rawCode} language={language} />;
            }
            return <pre>{children}</pre>;
          },
          code({ children }) {
            return <code className={styles.inlineCode}>{children}</code>;
          },
          table({ children, ...props }) {
            return (
              <div className={styles.tableWrapper}>
                <table className={styles.table} {...props}>
                  {children}
                </table>
              </div>
            );
          },
          img({ alt }) {
            return alt ? <span className={styles.imageAlt}>{alt}</span> : null;
          },
          a({ children, href, ...props }) {
            return (
              <a href={href} {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
