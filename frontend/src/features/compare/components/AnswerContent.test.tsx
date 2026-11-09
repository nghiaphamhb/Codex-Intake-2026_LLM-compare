import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnswerContent } from './AnswerContent';

describe('AnswerContent', () => {
  it('renders paragraphs, lists, and headings properly', () => {
    const markdown = `# Title\n\nThis is a paragraph.\n\n- Item 1\n- Item 2\n\n1. Numbered 1\n2. Numbered 2`;
    render(<AnswerContent markdown={markdown} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('This is a paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Numbered 2')).toBeInTheDocument();
  });

  it('renders GFM table within a horizontal-scrolling wrapper with semantic table elements', () => {
    const tableMarkdown = `| Model | Provider |\n|---|---|\n| GPT-4 | OpenAI |\n| Claude | Anthropic |`;
    const { container } = render(<AnswerContent markdown={tableMarkdown} />);

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(table?.querySelector('thead')).toBeInTheDocument();
    expect(table?.querySelector('tbody')).toBeInTheDocument();

    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Claude')).toBeInTheDocument();

    const wrapper = table?.parentElement;
    expect(wrapper?.className).toMatch(/tableWrapper/);
  });

  it('renders inline code inside text without converting to CodeBlock', () => {
    const markdown = 'Use `const foo = 1;` in your code.';
    const { container } = render(<AnswerContent markdown={markdown} />);

    const code = container.querySelector('code');
    expect(code).toBeInTheDocument();
    expect(code).toHaveTextContent('const foo = 1;');

    // Should not have a Copy button for inline code
    expect(screen.queryByRole('button', { name: /копировать/i })).toBeNull();
  });

  it('renders fenced code blocks via CodeBlock with copy button and language', () => {
    const codeMarkdown = '```typescript\nconst x: number = 42;\n```';
    const { container } = render(<AnswerContent markdown={codeMarkdown} />);

    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /копировать/i })).toBeInTheDocument();
    expect(container.textContent).toContain('const x: number = 42;');
  });

  it('skips raw HTML and does not execute scripts or create HTML elements (skipHtml)', () => {
    const unsafeHtml = 'Paragraph <script>alert("hack")</script> <b>Bold</b> <div id="injected">injected</div>';
    const { container } = render(<AnswerContent markdown={unsafeHtml} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('div#injected')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('sanitizes javascript: links', () => {
    const markdown = '[Click here](javascript:alert("exploit"))';
    const { container } = render(<AnswerContent markdown={markdown} />);

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).not.toBe('javascript:alert("exploit")');
  });

  it('does not render images directly, displaying alt text instead', () => {
    const markdown = '![Alternative description](https://example.com/image.png)';
    const { container } = render(<AnswerContent markdown={markdown} />);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Alternative description')).toBeInTheDocument();
  });

  it('renders links opening in the same tab (no target="_blank")', () => {
    const markdown = '[Documentation](https://example.com/docs)';
    render(<AnswerContent markdown={markdown} />);

    const link = screen.getByRole('link', { name: 'Documentation' });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    expect(link).not.toHaveAttribute('target', '_blank');
  });
});
