import { useMemo } from "react";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  breaks: false,
  linkify: true,
  typographer: true,
});

interface MarkdownRendererProps {
  text: string;
}

export default function MarkdownRenderer({ text }: MarkdownRendererProps) {
  const html = useMemo(() => md.render(text.trim()), [text]);

  return (
    <div
      data-markdown-content
      className="text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
