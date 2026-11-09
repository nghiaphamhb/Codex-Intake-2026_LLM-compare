import { useId, type InputHTMLAttributes } from 'react';
import styles from './TextInput.module.css';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function TextInput({
  label,
  id: customId,
  className,
  ...props
}: TextInputProps) {
  const generatedId = useId();
  const inputId = customId ?? generatedId;
  const combinedInputClass = className ? `${styles.input} ${className}` : styles.input;

  return (
    <div className={styles.container}>
      <label htmlFor={inputId} className={styles.visuallyHidden}>
        {label}
      </label>
      <input
        type="text"
        id={inputId}
        className={combinedInputClass}
        {...props}
      />
    </div>
  );
}

