import type { Message } from "@/lib/protocol";

/** Rich tooltip body for a tool call — name, args, result preview. */
export function ToolTooltipContent({ action }: { action: Message }) {
  const tool = action.toolName ?? "tool";
  const args = action.content;
  const result = action.toolResult;
  return (
    <div className="flex flex-col gap-1.5 text-xs max-w-sm">
      <div className="flex items-center gap-1.5">
        <span className="font-mono font-semibold">{tool}</span>
        {action.toolError && (
          <span className="text-destructive">— error</span>
        )}
        {!action.toolResult && (
          <span className="text-muted-foreground">— running…</span>
        )}
      </div>
      {args && (
        <pre className="font-mono whitespace-pre-wrap break-all opacity-80 max-h-24 overflow-hidden">
          {args.length > 280 ? args.slice(0, 280) + "…" : args}
        </pre>
      )}
      {result && (
        <pre className="font-mono whitespace-pre-wrap break-all opacity-60 border-t pt-1.5 max-h-24 overflow-hidden">
          {result.length > 280 ? result.slice(0, 280) + "…" : result}
        </pre>
      )}
    </div>
  );
}
