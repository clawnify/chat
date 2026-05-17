import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight } from "lucide-react";
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

  const stillThinking = Boolean(streaming && !content);
  useEffect(() => {
    if (!stillThinking) return;
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
    const tick = () =>
      setElapsed(Math.floor((Date.now() - (startedAtRef.current ?? 0)) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [stillThinking]);

  return (
    <div className="flex flex-col gap-2">
      {thinking && (
        <ThinkingBlock
          text={thinking}
          isStreaming={stillThinking}
          elapsedSeconds={elapsed}
          open={thinkingOpen}
          onToggle={() => setThinkingOpen((s) => !s)}
        />
      )}
      {content ? (
        <div className="markdown text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        streaming && !thinking && <span className="text-muted-foreground">…</span>
      )}
    </div>
  );
}

/**
 * One-line collapsed preview of the thinking text with a chevron on the
 * right. Click the row to expand and reveal the full body. Matches the
 * Anthropic-app style of thinking display: subtle, single-line, expandable.
 */
function ThinkingBlock({
  text,
  isStreaming,
  elapsedSeconds,
  open,
  onToggle,
}: {
  text: string;
  isStreaming: boolean;
  elapsedSeconds: number;
  open: boolean;
  onToggle: () => void;
}) {
  const preview = isStreaming
    ? `Thinking… ${formatElapsed(elapsedSeconds)}`
    : summarizePreview(text);

  return (
    <div className="flex flex-col gap-2 text-muted-foreground">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between gap-2 text-left text-sm hover:text-foreground transition-colors group"
      >
        <span className={cn("truncate", isStreaming && "italic")}>{preview}</span>
        {open ? (
          <ChevronDown size={14} className="shrink-0 opacity-60 group-hover:opacity-100" />
        ) : (
          <ChevronRight size={14} className="shrink-0 opacity-60 group-hover:opacity-100" />
        )}
      </button>
      {open && (
        <div className="border-l-2 border-border/70 pl-4 ml-1 text-sm leading-relaxed markdown text-muted-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/** First sentence-ish snippet of the thinking, truncated to a single line. */
function summarizePreview(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Thinking…";
  // Prefer first sentence; fall back to first line if no period.
  const sentenceEnd = trimmed.match(/^[^.!?\n]{0,180}[.!?]/);
  let preview = sentenceEnd ? sentenceEnd[0] : trimmed.split(/\n/)[0];
  preview = preview.trim();
  if (preview.length > 120) preview = preview.slice(0, 117) + "…";
  return preview;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
