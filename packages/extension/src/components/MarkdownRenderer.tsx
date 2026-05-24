import { useMemo } from "react";
import MarkdownIt from "markdown-it";

// Singleton — create once, reuse across renders
const md = new MarkdownIt({
  breaks: true, // convert '\n' to <br>
  linkify: true, // auto-convert URLs to links
  typographer: true, // smart quotes, dashes, etc.
});

interface MarkdownRendererProps {
  text: string;
}

export default function MarkdownRenderer({ text }: MarkdownRendererProps) {
  const html = useMemo(() => md.render(text), [text]);

  return (
    <div
      className="markdown-content text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
