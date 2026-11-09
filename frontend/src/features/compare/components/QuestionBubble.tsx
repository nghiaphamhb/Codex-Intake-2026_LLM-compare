import styles from './QuestionBubble.module.css';

export type QuestionBubbleProps = {
  text: string;
};

export function QuestionBubble({ text }: QuestionBubbleProps) {
  return (
    <div className={styles.bubble}>
      {text}
    </div>
  );
}

