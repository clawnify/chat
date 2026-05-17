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
        <div className="prose prose-sm dark:prose-invert max-w-none">
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
        className="self-start inline-flex items-center gap-1.5 text-left text-sm hover:text-foreground transition-colors group"
      >
        <span className={cn(isStreaming && "italic")}>{preview}</span>
        {open ? (
          <ChevronDown size={14} className="opacity-60 group-hover:opacity-100" />
        ) : (
          <ChevronRight size={14} className="opacity-60 group-hover:opacity-100" />
        )}
      </button>
      {open && (
        <div className="border-l-2 border-border/70 pl-4 ml-1 prose prose-sm prose-neutral dark:prose-invert max-w-none text-muted-foreground prose-headings:text-foreground prose-strong:text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/**
 * First sentence-ish snippet of the thinking, with markdown syntax stripped
 * (the preview row is rendered as plain text, not through ReactMarkdown).
 */
function summarizePreview(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Thinking…";
  const sentenceEnd = trimmed.match(/^[^.!?\n]{0,180}[.!?]/);
  let preview = sentenceEnd ? sentenceEnd[0] : trimmed.split(/\n/)[0];
  preview = stripInlineMarkdown(preview).trim();
  if (preview.length > 120) preview = preview.slice(0, 117) + "…";
  return preview;
}

function stripInlineMarkdown(s: string): string {
  return s
    .replace(/^\s*#{1,6}\s+/, "") // leading "### "
    .replace(/\*\*(.*?)\*\*/g, "$1") // **bold**
    .replace(/__(.*?)__/g, "$1") // __bold__
    .replace(/(^|\W)\*(\S[^*]*?\S?)\*(?=\W|$)/g, "$1$2") // *italic*
    .replace(/(^|\W)_(\S[^_]*?\S?)_(?=\W|$)/g, "$1$2") // _italic_
    .replace(/`([^`]+)`/g, "$1") // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // [text](url)
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
