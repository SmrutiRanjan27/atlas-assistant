import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";


type MarkdownContentProps = {
  content: string;
  className?: string;
};


export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      className={clsx(
        "prose prose-invert max-w-none prose-p:leading-relaxed prose-headings:text-atlas-text prose-p:text-atlas-text prose-strong:text-atlas-accent-strong prose-a:text-atlas-success prose-a:no-underline hover:prose-a:underline prose-code:text-[0.9rem] prose-code:bg-[rgba(8,12,28,0.7)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-pre:bg-[rgba(8,12,28,0.85)] prose-pre:border prose-pre:border-[rgba(124,108,255,0.15)] prose-pre:rounded-2xl prose-pre:p-4 prose-li:marker:text-atlas-accent",
        className,
      )}
      remarkPlugins={[remarkGfm]}
    >
      {content}
    </ReactMarkdown>
  );
}