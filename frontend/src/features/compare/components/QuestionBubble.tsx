import styles from './QuestionBubble.module.css';
import ReactMarkdown from 'react-markdown';
import { questionMathParts, mathRemarkPlugins, mathRehypePlugins } from '../math';

export type QuestionBubbleProps = {
  text: string;
  className?: string;
};

export function QuestionBubble({ text, className }: QuestionBubbleProps) {
  return (
    <div className={`${styles.bubble} ${className || ''}`}>
      {questionMathParts(text).map((part, index) =>
        part.math ? (
          <ReactMarkdown
            key={index}
            skipHtml
            remarkPlugins={mathRemarkPlugins}
            rehypePlugins={mathRehypePlugins}
            components={{ p: ({ children }) => <span>{children}</span> }}
          >
            {part.text}
          </ReactMarkdown>
        ) : (
          part.text
        ),
      )}
    </div>
  );
}
