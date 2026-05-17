import { Terminal } from "lucide-react";
import { SLASH_COMMANDS, type SlashCommand } from "@/lib/protocol";
import { cn } from "@/lib/utils";

export function SlashMenu({
  filter,
  selectedIdx,
  onSelect,
}: {
  filter: string;
  selectedIdx: number;
  onSelect: (cmd: SlashCommand) => void;
}) {
  const filtered = filterCommands(filter);
  if (filtered.length === 0) return null;
  return (
    <div className="absolute bottom-2 left-0 right-0 z-10 rounded-md border bg-popover text-popover-foreground shadow-lg overflow-hidden">
      <div className="max-h-72 overflow-y-auto p-1">
        {filtered.map((cmd, i) => (
          <button
            key={cmd.name}
            type="button"
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-left text-sm",
              i === selectedIdx
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted",
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(cmd);
            }}
          >
            <Terminal size={14} className="shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-mono">{cmd.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {cmd.description}
              </span>
            </div>
          </button>
        ))}
      </div>
      <div className="border-t bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
        <Kbd>Tab</Kbd> or <Kbd>Enter</Kbd> to select · <Kbd>Esc</Kbd> to dismiss
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-background border rounded px-1 py-0.5 font-mono text-[10px]">
      {children}
    </kbd>
  );
}

export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const q = input.slice(1).toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.slice(1).toLowerCase().startsWith(q));
}
