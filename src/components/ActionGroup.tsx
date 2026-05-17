import { useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import type { Message } from "@/lib/protocol";
import { ActionIcon, actionLabel } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function ActionGroup({
  actions,
  anyPending,
}: {
  actions: Message[];
  anyPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const latest = actions[actions.length - 1];
  const hasError = actions.some((a) => a.toolError);

  return (
    <div className="self-start flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-muted/50 text-xs text-muted-foreground transition-colors hover:bg-muted",
          hasError && "border-destructive/40 text-destructive bg-destructive/5",
          anyPending && "animate-pulse",
        )}
      >
        <ActionIcon toolName={latest.toolName ?? "tool"} args={latest.content} />
        {anyPending && <Loader2 size={10} className="animate-spin" />}
        <span className="tabular-nums opacity-70">{actions.length}</span>
        <ChevronRight
          size={12}
          className={cn(
            "opacity-50 transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>

      {expanded && (
        <div className="flex flex-wrap gap-1.5">
          {actions.map((a, j) => (
            <div
              key={j}
              title={actionLabel(a.toolName ?? "tool", a.content)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-full border bg-muted/50 text-muted-foreground",
                a.toolError && "border-destructive/40 text-destructive bg-destructive/5",
              )}
            >
              <ActionIcon toolName={a.toolName ?? "tool"} args={a.content} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
