import { unified, type PluggableList } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './math.css';

const parser = unified().use(remarkParse).use(remarkMath);
export const mathRemarkPlugins: PluggableList = [remarkMath, remarkDisplayMath];
export const mathRehypePlugins: PluggableList = [rehypeSafeMath];

type SourceNode = {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: SourceNode[];
  data?: { hProperties?: { className?: string[] } };
};
type Span = { start: number; end: number };

function remarkDisplayMath() {
  return (tree: SourceNode, file: { value: unknown }) => {
    const source = String(file.value);
    function visit(node: SourceNode) {
      if (
        node.type === 'inlineMath' &&
        source.slice(node.position?.start.offset).startsWith('$$')
      ) {
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, className: ['language-math', 'math-display'] },
        };
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}

function rehypeSafeMath() {
  const render = rehypeKatex({ trust: false, strict: 'ignore', maxExpand: 1000 });
  return (tree: Parameters<typeof render>[0], file: Parameters<typeof render>[1]) => {
    const restore: (() => void)[] = [];
    function protect(node: typeof tree | (typeof tree.children)[number]) {
      if (node.type === 'element' && node.tagName === 'code') {
        const classes = node.properties.className;
        if (
          Array.isArray(classes) &&
          classes.includes('language-math') &&
          !classes.includes('math-inline') &&
          !classes.includes('math-display')
        ) {
          node.properties.className = classes.filter((name) => name !== 'language-math');
          restore.push(() => {
            node.properties.className = classes;
          });
        }
      }
      if ('children' in node) node.children.forEach(protect);
    }
    protect(tree);
    try {
      render(tree, file);
    } finally {
      restore.forEach((undo) => undo());
    }
  };
}

function spans(source: string, types: Set<string>): Span[] {
  const result: Span[] = [];
  function visit(node: SourceNode) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (types.has(node.type) && start !== undefined && end !== undefined) {
      result.push({ start, end });
      return;
    }
    node.children?.forEach(visit);
  }
  visit(parser.parse(source));
  return result;
}

// Normalize only complete delimiter pairs outside Markdown code, HTML and existing math.
// The original response/prompt is never changed in state or in the API request.
export function normalizeMath(source: string): string {
  const protectedSpans = spans(
    source,
    new Set(['code', 'inlineCode', 'html', 'math', 'inlineMath']),
  );
  const convert = (text: string) =>
    text.replace(
      /(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)|(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g,
      (_match, inline: string | undefined, display: string | undefined) =>
        inline !== undefined
          ? `$${inline}$`
          : display?.includes('\n')
            ? `\n$$\n${display}\n$$\n`
            : `$$${display}$$`,
    );
  let cursor = 0;
  let output = '';
  for (const { start, end } of protectedSpans) {
    output += convert(source.slice(cursor, start)) + source.slice(start, end);
    cursor = end;
  }
  return output + convert(source.slice(cursor));
}

export function questionMathParts(source: string): { text: string; math: boolean }[] {
  const normalized = normalizeMath(source);
  const parts: { text: string; math: boolean }[] = [];
  let cursor = 0;
  for (const { start, end } of spans(normalized, new Set(['math', 'inlineMath']))) {
    parts.push({ text: normalized.slice(cursor, start), math: false });
    parts.push({ text: normalized.slice(start, end), math: true });
    cursor = end;
  }
  parts.push({ text: normalized.slice(cursor), math: false });
  return parts;
}
