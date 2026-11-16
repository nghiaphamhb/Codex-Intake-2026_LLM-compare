import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnswerContent } from './AnswerContent';

describe('AnswerContent', () => {
  it('renders multiline backslash display math without treating its first line as metadata', () => {
    const { container } = render(
      <AnswerContent markdown={String.raw`\[x^2 +` + '\n' + String.raw`y^2\]`} />,
    );
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container.querySelector('annotation')?.textContent).toContain('x^2 +');
    expect(container.querySelector('annotation')?.textContent).toContain('y^2');
  });
  it('does not trust math commands that request external resources or unsafe links', () => {
    const { container } = render(
      <AnswerContent
        markdown={String.raw`$\href{javascript:alert(1)}{click}$ and $\includegraphics{https://example.com/image.png}$`}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
  it('keeps a math-language code fence as literal copyable code', () => {
    const { container } = render(<AnswerContent markdown={'```math\nx^2 + $literal$\n```'} />);
    expect(container.querySelector('.katex')).toBeNull();
    expect(container.querySelector('pre code')?.textContent).toContain('x^2 + $literal$');
    expect(screen.getByRole('button', { name: /копировать/i })).toBeInTheDocument();
    expect(screen.getByText('math')).toBeInTheDocument();
  });
  it('keeps display math inside list items, blockquotes and table cells', () => {
    const { container } = render(
      <AnswerContent
        markdown={String.raw`- Solve \[x^2\] next

> Quoted \[y^2\] next

| Formula |
|---|
| \[z^2\] |`}
      />,
    );
    expect(container.querySelector('li')?.textContent).toContain('next');
    expect(container.querySelector('li .katex-display')).not.toBeNull();
    expect(container.querySelector('blockquote .katex-display')).not.toBeNull();
    expect(container.querySelector('td .katex-display')).not.toBeNull();
  });
  it('renders dollar and backslash math without changing inline or fenced code', () => {
    const { container } = render(
      <AnswerContent
        markdown={
          String.raw`Inline $x^2$ and \(y^2\).

\[\frac{4^x}{2^y}=8\]

$$
\boxed{8}
$$

Code: ` +
          '`' +
          String.raw`\(keep\) $literal$` +
          '`\n\n```text\n' +
          String.raw`\[code\]` +
          '\n```'
        }
      />,
    );
    expect(container.querySelectorAll('.katex')).toHaveLength(4);
    expect(container.querySelector('pre code')?.textContent).toContain(String.raw`\[code\]`);
    expect(container.querySelector('code')?.textContent).toContain(String.raw`\(keep\) $literal$`);
  });

  it('survives incomplete math during streaming and renders once closed', () => {
    const { container, rerender } = render(<AnswerContent markdown={String.raw`\(\frac{4^x}`} />);
    expect(container.querySelector('.katex')).toBeNull();
    rerender(<AnswerContent markdown={String.raw`\(\frac{4^x}{2^y}\)`} />);
    expect(container.querySelector('.katex')).not.toBeNull();
  });
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
    const unsafeHtml =
      'Paragraph <script>alert("hack")</script> <b>Bold</b> <div id="injected">injected</div>';
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
