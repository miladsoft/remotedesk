import ReactMarkdown from "react-markdown";
import { openUrl } from "@tauri-apps/plugin-opener";

export function UpdateReleaseNotes({ body }: { body: string }) {
  return (
    <div className="max-h-48 overflow-y-auto pr-1 text-sm text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        components={{
          h1: (props) => <h3 className="mt-3 mb-1 text-sm font-semibold text-foreground" {...props} />,
          h2: (props) => <h3 className="mt-3 mb-1 text-sm font-semibold text-foreground" {...props} />,
          h3: (props) => <h4 className="mt-3 mb-1 text-sm font-semibold text-foreground" {...props} />,
          p: (props) => <p className="mb-2 leading-relaxed" {...props} />,
          ul: (props) => <ul className="mb-2 list-disc space-y-0.5 pl-4" {...props} />,
          ol: (props) => <ol className="mb-2 list-decimal space-y-0.5 pl-4" {...props} />,
          li: (props) => <li className="leading-relaxed" {...props} />,
          strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
          code: (props) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground" {...props} />
          ),
          a: ({ href, ...props }) => (
            <a
              href={href}
              className="underline underline-offset-2 hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                if (href) void openUrl(href);
              }}
              {...props}
            />
          ),
          hr: () => <hr className="my-2 border-border" />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
