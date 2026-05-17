import { Eye, FileEdit, Pencil } from "lucide-react";
import type { Message } from "@/lib/protocol";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToolTooltipContent } from "@/components/ToolTooltipContent";

/**
 * Horizontal row of filename pills for read / write / edit tool calls.
 * Each pill carries the file path next to a Eye / Pencil / FileEdit icon —
 * agent loops that read N files no longer collapse into "📖 N" but show
 * which files were touched.
 */
export function FileActionPills({ actions }: { actions: Message[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 self-start">
      {actions.map((a, i) => (
        <FilePill key={i} action={a} />
      ))}
    </div>
  );
}

function FilePill({ action }: { action: Message }) {
  const tool = action.toolName ?? "";
  const Icon = tool === "read" ? Eye : tool === "write" ? Pencil : FileEdit;
  const path = action.content || tool;
  const isError = action.toolError;
  const pending = !action.toolResult;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-muted/50 text-xs cursor-default",
            isError
              ? "border-destructive/40 text-destructive bg-destructive/5"
              : "text-muted-foreground border-border/60",
            pending && "animate-pulse",
          )}
        >
          <Icon size={12} className="shrink-0" />
          <span className="font-mono truncate max-w-[28ch]">{basename(path)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <ToolTooltipContent action={action} />
      </TooltipContent>
    </Tooltip>
  );
}

function basename(path: string): string {
  const cleaned = path.replace(/\/+$/, "");
  const idx = cleaned.lastIndexOf("/");
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}
