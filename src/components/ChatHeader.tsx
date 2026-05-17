import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import type { GatewayWs } from "@/lib/gateway-ws";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extractText } from "@/lib/protocol";
import { cn } from "@/lib/utils";

interface SessionEntry {
  key: string;
  displayName?: string;
  derivedTitle?: string;
  label?: string;
  lastMessagePreview?: string;
}

/**
 * Top-of-chat header showing the active session label with a dropdown for
 * Rename + Delete. Title source falls through the same priority as the
 * sidebar: gateway-provided fields → first user message → key suffix.
 */
export function ChatHeader({
  gw,
  sessionKey,
  onSessionsChanged,
  onSessionDeleted,
}: {
  gw: GatewayWs;
  sessionKey: string;
  /** Increment to bust caches when a session is renamed elsewhere. */
  onSessionsChanged: () => void;
  /** Callback after the active session is removed — App should navigate
   *  back to the default session. */
  onSessionDeleted: () => void;
}) {
  const [title, setTitle] = useState<string>(() => suffix(sessionKey));
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState<"rename" | "delete" | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Fetch the current session's title. Tries sessions.list first, falls
  // back to the first user message via chat.history.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await gw.request<{ sessions?: SessionEntry[] }>(
          "sessions.list",
          {},
        );
        if (cancelled) return;
        const here = list?.sessions?.find((s) => s.key === sessionKey);
        const gwTitle =
          here?.derivedTitle?.trim() ||
          here?.displayName?.trim() ||
          here?.label?.trim() ||
          truncate(here?.lastMessagePreview ?? "", 48);
        if (gwTitle) {
          setTitle(gwTitle);
          return;
        }
        // Fallback: pull the first user message.
        const hist = await gw.request<{ messages?: unknown[] }>(
          "chat.history",
          { sessionKey },
        );
        if (cancelled) return;
        const entries = Array.isArray(hist?.messages) ? hist.messages : [];
        for (const entry of entries) {
          const e = entry as Record<string, unknown>;
          if (e.role === "user") {
            const text = extractText(e.content).trim();
            if (text) {
              setTitle(truncate(text, 48));
              return;
            }
          }
        }
        setTitle(suffix(sessionKey));
      } catch {
        if (!cancelled) setTitle(suffix(sessionKey));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [gw, sessionKey]);

  async function commitRename(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === title) {
      setRenameOpen(false);
      return;
    }
    setPending("rename");
    try {
      await gw.request("sessions.patch", {
        key: sessionKey,
        displayName: trimmed,
      });
      setTitle(trimmed);
      onSessionsChanged();
    } catch (err) {
      console.error("Rename failed:", err);
    } finally {
      setPending(null);
      setRenameOpen(false);
    }
  }

  async function commitDelete() {
    setPending("delete");
    try {
      // Upstream uses `sessions.delete`; fall back to a reset if the
      // gateway version doesn't support it.
      try {
        await gw.request("sessions.delete", { key: sessionKey });
      } catch {
        await gw.request("sessions.reset", {
          key: sessionKey,
          reason: "reset",
        });
      }
      onSessionsChanged();
      onSessionDeleted();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setPending(null);
      setDeleteOpen(false);
    }
  }

  return (
    <header className="px-4 py-3 border-b">
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-base font-medium hover:bg-muted transition-colors"
          >
            <span className="truncate max-w-[40ch]">{title}</span>
            <ChevronDown size={14} className="opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1">
          <MenuItem
            icon={<Pencil size={14} />}
            label="Rename"
            onClick={() => {
              setMenuOpen(false);
              setRenameOpen(true);
              setTimeout(() => renameInputRef.current?.select(), 50);
            }}
          />
          <MenuItem
            icon={<Trash2 size={14} />}
            label="Delete"
            destructive
            onClick={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
            <DialogDescription>
              Pick a name for this conversation.
            </DialogDescription>
          </DialogHeader>
          <RenameForm
            initial={title}
            inputRef={renameInputRef}
            disabled={pending === "rename"}
            onConfirm={commitRename}
            onCancel={() => setRenameOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete session?</DialogTitle>
            <DialogDescription>
              This removes the transcript for{" "}
              <span className="font-medium text-foreground">{title}</span>.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={pending === "delete"}
              className="px-3 py-1.5 rounded-md text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitDelete}
              disabled={pending === "delete"}
              className="px-3 py-1.5 rounded-md text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending === "delete" ? "Deleting…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function MenuItem({
  icon,
  label,
  destructive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function RenameForm({
  initial,
  inputRef,
  disabled,
  onConfirm,
  onCancel,
}: {
  initial: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onConfirm: (next: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(value);
      }}
      className="flex flex-col gap-3"
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        disabled={disabled}
        autoFocus
        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <DialogFooter>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="px-3 py-1.5 rounded-md text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {disabled ? "Saving…" : "Rename"}
        </button>
      </DialogFooter>
    </form>
  );
}

function suffix(key: string): string {
  const tail = key.split(":").pop() ?? key;
  if (tail === "main") return "main";
  return tail.length > 12 ? tail.slice(0, 11) + "…" : tail;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
