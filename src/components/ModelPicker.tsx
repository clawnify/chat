import { useEffect, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { GatewayWs } from "@/lib/gateway-ws";
import { cn } from "@/lib/utils";

interface ModelChoice {
  id: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
}

/**
 * Popover with a search input + scrollable list of models. Selecting one
 * sends sessions.patch to switch the active session's model.
 */
export function ModelPicker({
  gw,
  sessionKey,
  currentModel,
  onModelChanged,
  children,
}: {
  gw: GatewayWs;
  sessionKey: string;
  currentModel: string;
  onModelChanged: (modelId: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [patching, setPatching] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazy-load on first open; cache the result.
  useEffect(() => {
    if (!open || models.length > 0) return;
    setLoading(true);
    let cancelled = false;
    gw.request<{ models?: ModelChoice[] } | ModelChoice[]>("models.list", {})
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.models)
            ? res.models
            : [];
        setModels(list);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gw, models.length]);

  // Auto-focus the search input when the popover opens.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = filterModels(models, query);

  async function pick(id: string) {
    setPatching(id);
    try {
      await gw.request("sessions.patch", { key: sessionKey, model: id });
      onModelChanged(id);
      setOpen(false);
    } catch (err) {
      console.error("Model switch failed:", err);
    } finally {
      setPatching(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-96 p-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search models…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-72 overflow-y-auto no-scrollbar p-1">
          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Loading models…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {models.length === 0
                ? "No models available."
                : "No matches."}
            </div>
          )}
          {!loading &&
            filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m.id)}
                disabled={patching === m.id}
                className={cn(
                  "w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                  m.id === currentModel
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  patching === m.id && "opacity-50 cursor-wait",
                )}
              >
                <Check
                  size={12}
                  className={cn(
                    "shrink-0",
                    m.id === currentModel ? "opacity-100" : "opacity-0",
                  )}
                />
                <div className="flex min-w-0 flex-col flex-1">
                  <span className="truncate font-mono text-xs">{m.id}</span>
                  {m.name && m.name !== m.id && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {m.name}
                    </span>
                  )}
                </div>
                {m.provider && (
                  <span className="shrink-0 text-[10px] text-muted-foreground/70 uppercase">
                    {m.provider}
                  </span>
                )}
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function filterModels(models: ModelChoice[], query: string): ModelChoice[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter((m) =>
    [m.id, m.name, m.provider].some((field) =>
      field?.toLowerCase().includes(q),
    ),
  );
}
