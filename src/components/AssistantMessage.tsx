import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  const stillThinking = streaming && !content;
  useEffect(() => {
    if (!stillThinking) return;
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
    const tick = () =>
      setElapsed(Math.floor((Date.now() - (startedAtRef.current ?? 0)) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [stillThinking]);

  const thinkingLabel = stillThinking
    ? `Thinking… ${formatElapsed(elapsed)}`
    : "Thought";

  return (
    <div className="flex flex-col gap-2">
      {thinking && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setThinkingOpen((s) => !s)}
            className="inline-flex self-start items-center gap-1 px-2 py-0.5 rounded text-xs text-muted-foreground border border-dashed border-border hover:text-foreground"
          >
            <ChevronRight
              size={12}
              className={cn(
                "transition-transform",
                thinkingOpen && "rotate-90",
              )}
            />
            {thinkingLabel}
          </button>
          {thinkingOpen && (
            <pre className="bg-muted/50 border-l-2 border-border pl-3 py-2 m-0 text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words rounded-r">
              {thinking}
            </pre>
          )}
        </div>
      )}
      {content ? (
        <div className="markdown text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        streaming && <span className="text-muted-foreground">…</span>
      )}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
