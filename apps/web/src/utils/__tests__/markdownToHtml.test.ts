import { markdownToHtml } from '../markdownToHtml';

describe('markdownToHtml', () => {
  test('converts basic text', () => {
    expect(markdownToHtml('Hello World')).toBe('<p>Hello World</p>');
  });

  test('converts bold text', () => {
    expect(markdownToHtml('**bold**')).toBe('<p><strong>bold</strong></p>');
    expect(markdownToHtml('__bold__')).toBe('<p><strong>bold</strong></p>');
  });

  test('converts italic text', () => {
    expect(markdownToHtml('*italic*')).toBe('<p><em>italic</em></p>');
    expect(markdownToHtml('_italic_')).toBe('<p><em>italic</em></p>');
  });

  test('converts headings', () => {
    expect(markdownToHtml('# H1')).toBe('<h1>H1</h1>');
    expect(markdownToHtml('## H2')).toBe('<h2>H2</h2>');
    expect(markdownToHtml('### H3')).toBe('<h3>H3</h3>');
  });

  test('converts links', () => {
    expect(markdownToHtml('[link](https://example.com)')).toBe(
      '<p><a href="https://example.com">link</a></p>'
    );
  });

  test('converts code blocks', () => {
    expect(markdownToHtml('```\ncode block\n```')).toBe(
      '<pre><code>code block</code></pre>'
    );
  });

  test('converts inline code', () => {
    expect(markdownToHtml('`inline code`')).toBe(
      '<p><code>inline code</code></p>'
    );
  });

  test('converts lists', () => {
    expect(markdownToHtml('- item 1\n- item 2')).toBe(
      '<ul><li>item 1</li><li>item 2</li></ul>'
    );
    expect(markdownToHtml('1. item 1\n2. item 2')).toBe(
      '<ol><li>item 1</li><li>item 2</li></ol>'
    );
  });

  test('converts blockquotes', () => {
    expect(markdownToHtml('> quote')).toBe('<blockquote><p>quote</p></blockquote>');
  });

  test('handles complex nested markdown', () => {
    const input = `# Title
    
This is a **bold** and *italic* text with \`inline code\`.

> A blockquote with [link](https://example.com)

\`\`\`
code block
\`\`\`

- List item 1
- List item 2
  - Nested item`;

    const expected = `<h1>Title</h1><p>This is a <strong>bold</strong> and <em>italic</em> text with <code>inline code</code>.</p><blockquote><p>A blockquote with <a href="https://example.com">link</a></p></blockquote><pre><code>code block</code></pre><ul><li>List item 1</li><li>List item 2<ul><li>Nested item</li></ul></li></ul>`;

    expect(markdownToHtml(input).replace(/\s+/g, '')).toBe(expected.replace(/\s+/g, ''));
  });
}); 
describe('raw HTML in markdown', () => {
  test('is shown as text, not run', () => {
    expect(markdownToHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markdownToHtml('Hi <img src=x onerror=alert(1)> there')).toBe('<p>Hi &lt;img src=x onerror=alert(1)&gt; there</p>');
  });

  test('inside code stays readable', () => {
    expect(markdownToHtml('`a < b`')).toBe('<p><code>a &lt; b</code></p>');
  });
});
