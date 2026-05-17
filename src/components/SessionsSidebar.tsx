import { useEffect, useState } from "react";
import { Plus, Settings as SettingsIcon } from "lucide-react";
import type { GatewayWs } from "@/lib/gateway-ws";
import { cn } from "@/lib/utils";

export type ConnPillState = "idle" | "connecting" | "connected" | "error";

/**
 * Per-session record returned by `sessions.list`. Field set mirrors
 * upstream `TuiSessionList["sessions"][number]` in src/tui/tui-backend.ts.
 * We only consume the title-relevant fields; everything else is ignored.
 */
interface SessionEntry {
  key: string;
  displayName?: string;
  derivedTitle?: string;
  label?: string;
  lastMessagePreview?: string;
  updatedAt?: number | null;
  hasActiveRun?: boolean;
}

interface SessionsListResponse {
  sessions?: SessionEntry[];
}

/**
 * Sessions list. Calls `sessions.list` per upstream
 * `src/tui/gateway-chat.ts:listSessions`. Click to switch active session;
 * "+" resets the current session (creates a fresh transcript on the same
 * sessionKey — full multi-session UX is a future stage).
 */
export function SessionsSidebar({
  gw,
  activeKey,
  onSelect,
  onNew,
  onOpenSettings,
  connState,
}: {
  gw: GatewayWs;
  activeKey: string;
  onSelect: (key: string) => void;
  onNew: () => void;
  onOpenSettings: () => void;
  connState: ConnPillState;
}) {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    gw.request<SessionsListResponse>("sessions.list", {})
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.sessions) ? res.sessions : [];
        if (list.some((s) => s.key === activeKey)) {
          setSessions(list);
        } else {
          // Make sure the active session always appears in the list, even
          // if the gateway hasn't materialized it yet.
          setSessions([{ key: activeKey }, ...list]);
        }
      })
      .catch(() => {
        if (!cancelled) setSessions([{ key: activeKey }]);
      });
    return () => {
      cancelled = true;
    };
  }, [gw, activeKey]);

  return (
    <aside className="w-64 shrink-0 border-r flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Sessions
        </span>
        <button
          type="button"
          onClick={onNew}
          title="New session"
          className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-0.5">
        {sessions.map((s) => (
          <SessionRow
            key={s.key}
            session={s}
            active={s.key === activeKey}
            onClick={() => onSelect(s.key)}
          />
        ))}
      </nav>

      <div className="border-t px-3 py-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <SettingsIcon size={14} />
        </button>
        <ConnPill state={connState} onClick={onOpenSettings} />
      </div>
    </aside>
  );
}

function ConnPill({
  state,
  onClick,
}: {
  state: ConnPillState;
  onClick: () => void;
}) {
  const labels: Record<ConnPillState, string> = {
    idle: "Disconnected",
    connecting: "Connecting…",
    connected: "Connected",
    error: "Failed",
  };
  const tone: Record<ConnPillState, string> = {
    idle: "text-muted-foreground border-border bg-background",
    connecting:
      "text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-50 dark:bg-amber-950/30",
    connected:
      "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30",
    error:
      "text-red-600 dark:text-red-400 border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30",
  };
  const dotTone: Record<ConnPillState, string> = {
    idle: "bg-muted-foreground/60",
    connecting: "bg-amber-500 animate-pulse",
    connected: "bg-emerald-500",
    error: "bg-red-500",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title="Open connection settings"
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] border transition-colors hover:opacity-80",
        tone[state],
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dotTone[state])} />
      {labels[state]}
    </button>
  );
}

function SessionRow({
  session,
  active,
  onClick,
}: {
  session: SessionEntry;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <span className="truncate">{sessionTitle(session)}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground/70">
        {relativeAge(session.updatedAt ?? undefined)}
      </span>
    </button>
  );
}

/**
 * Pick the most human-readable title from a session record. Prefer the
 * gateway-derived title (which is the first user message), then the
 * explicit displayName/label, then trim the last message preview, then
 * fall back to a key-derived label.
 */
function sessionTitle(s: SessionEntry): string {
  const candidate =
    s.derivedTitle?.trim() ||
    s.displayName?.trim() ||
    s.label?.trim() ||
    firstWords(s.lastMessagePreview);
  if (candidate) return truncate(candidate, 48);
  const parts = s.key.split(":");
  const tail = parts[parts.length - 1] || s.key;
  if (tail === "main") return "main";
  return truncate(tail, 12);
}

function firstWords(text: string | undefined, n = 8): string {
  if (!text) return "";
  return text.trim().split(/\s+/).slice(0, n).join(" ");
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function relativeAge(ts?: number): string {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
