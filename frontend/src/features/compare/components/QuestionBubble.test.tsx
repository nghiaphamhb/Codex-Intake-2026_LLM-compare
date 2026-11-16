import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionBubble } from './QuestionBubble';

describe('QuestionBubble', () => {
  it('renders question text properly', () => {
    render(<QuestionBubble text="Как написать бинарный поиск на TypeScript?" />);
    expect(screen.getByText('Как написать бинарный поиск на TypeScript?')).toBeInTheDocument();
  });

  it('renders HTML tags as literal plain text without executing or creating elements', () => {
    const rawHtml = '<script>alert(1)</script><img src="x" onerror="alert(2)" /><b>Bold</b>';
    const { container } = render(<QuestionBubble text={rawHtml} />);

    // Script and img elements should not exist in DOM
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();

    // The text content should be exactly the raw string
    expect(container).toHaveTextContent(rawHtml);
  });

  it('preserves multi-line text and whitespace formatting', () => {
    const multiLine = 'Line 1\nLine 2\n\nLine 4';
    const { container } = render(<QuestionBubble text={multiLine} />);
    expect(container.textContent).toBe(multiLine);
  });
});

it('renders math in a question while preserving ordinary text and code literally', () => {
  const text = String.raw`**Question**: \(\frac{4^x}{2^y}\) and ` + '`$code$`';
  const { container } = render(<QuestionBubble text={text} />);
  expect(container.querySelector('.katex')).not.toBeNull();
  expect(container.textContent).toContain('**Question**: ');
  expect(container.textContent).toContain('`$code$`');
  expect(container.querySelector('strong')).toBeNull();
});
