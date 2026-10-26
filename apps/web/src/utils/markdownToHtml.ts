import { Marked } from 'marked';

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Raw HTML in the markdown is shown as text, never run. (Escaping the whole
// input first instead also broke blockquotes and double-escaped code.)
const marked = new Marked({
  async: false,
  renderer: {
    html: ({ text }) => escapeHtml(text),
  },
});

/** Markdown as compact HTML: no line breaks between tags, none at the end of code blocks. */
export function markdownToHtml(md: string): string {
  return (marked.parse(md) as string)
    .replace(/\n<\/code><\/pre>/g, '</code></pre>')
    .replace(/>\n+</g, '><')
    .trim();
}
