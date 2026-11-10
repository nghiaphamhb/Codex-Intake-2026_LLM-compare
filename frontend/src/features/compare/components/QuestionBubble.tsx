import styles from './QuestionBubble.module.css';

export type QuestionBubbleProps = {
  text: string;
  className?: string;
};

export function QuestionBubble({ text, className }: QuestionBubbleProps) {
  return (
    <div className={`${styles.bubble} ${className || ''}`}>
      {text}
    </div>
  );
}
