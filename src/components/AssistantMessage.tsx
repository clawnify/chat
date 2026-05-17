import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight } from "lucide-react";

/**
 * Render assistant text as GitHub-flavored markdown. Optionally surfaces the
 * thinking/reasoning block as a collapsible above the body.
 */
export function AssistantMessage({
  content,
  thinking,
  streaming,
}: {
  content: string;
  thinking?: string;
  streaming?: boolean;
}) {
  const [thinkingOpen, setThinkingOpen] = useState(false);
  return (
    <div className="msg-content">
      {thinking && (
        <div className="thinking">
          <button
            type="button"
            className="thinking-toggle"
            onClick={() => setThinkingOpen((s) => !s)}
          >
            <ChevronRight
              size={12}
              className={`thinking-chev${thinkingOpen ? " is-open" : ""}`}
            />
            Thinking
          </button>
          {thinkingOpen && <pre className="thinking-body">{thinking}</pre>}
        </div>
      )}
      {content ? (
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        streaming && <span className="streaming-dot">…</span>
      )}
    </div>
  );
}
