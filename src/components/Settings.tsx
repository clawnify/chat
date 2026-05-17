import { useEffect, useState, type FormEvent } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/lib/theme";
import type { GatewayWs } from "@/lib/gateway-ws";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/** Symbolic identifiers shared with the sidebar so the popover can drive
 *  which focused dialog opens. */
export type SettingsSection =
  | "connection"
  | "agents"
  | "providers"
  | "appearance"
  | "about";

const inputClass =
  "w-full bg-background border border-input rounded-md px-3 py-2 text-sm font-mono " +
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

// ---------- Connection ----------

export function ConnectionDialog({
  open,
  onOpenChange,
  initialUrl,
  initialToken,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialUrl: string;
  initialToken: string;
  onSave: (url: string, token: string, persistToken: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connection</DialogTitle>
          <DialogDescription>
            OpenClaw gateway URL and shared-secret token.
          </DialogDescription>
        </DialogHeader>
        <ConnectionForm
          initialUrl={initialUrl}
          initialToken={initialToken}
          onSave={onSave}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Standalone form usable outside the dialog (setup-time, before a gateway). */
export function ConnectionForm({
  initialUrl,
  initialToken,
  onSave,
  onCancel,
}: {
  initialUrl: string;
  initialToken: string;
  onSave: (url: string, token: string, persistToken: boolean) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [token, setToken] = useState(initialToken);
  const [persistToken, setPersistToken] = useState(initialToken.length > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || !token.trim()) return;
    onSave(url.trim(), token.trim(), persistToken);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field
        label="Gateway URL"
        hint={
          <>
            Accepts <code className="px-1 bg-muted rounded">ws://</code>,{" "}
            <code className="px-1 bg-muted rounded">wss://</code>,{" "}
            <code className="px-1 bg-muted rounded">http://</code>,{" "}
            <code className="px-1 bg-muted rounded">https://</code>, or a bare{" "}
            <code className="px-1 bg-muted rounded">host:port</code>.
          </>
        }
      >
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder="ws://127.0.0.1:18789"
          autoFocus
          spellCheck={false}
          className={inputClass}
        />
      </Field>

      <Field
        label="Gateway token"
        hint={
          <>
            From your gateway's{" "}
            <code className="px-1 bg-muted rounded">~/.openclaw/openclaw.json</code>{" "}
            under <code className="px-1 bg-muted rounded">gateway.auth.token</code>.
          </>
        }
      >
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.currentTarget.value)}
          placeholder="shared secret"
          spellCheck={false}
          autoComplete="off"
          className={inputClass}
        />
      </Field>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={persistToken}
          onChange={(e) => setPersistToken(e.currentTarget.checked)}
          className="h-4 w-4 rounded border border-input"
        />
        <span>Remember token in this browser (localStorage)</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!url.trim() || !token.trim()}
          className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Connect
        </button>
      </div>
    </form>
  );
}

// ---------- Agents ----------

interface AgentEntry {
  id?: string;
  name?: string;
  model?: { primary?: string };
  thinking?: string;
}

export function AgentsDialog({
  open,
  onOpenChange,
  gw,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gw: GatewayWs | null;
}) {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !gw) return;
    setLoading(true);
    let cancelled = false;
    gw.request<{ agents?: AgentEntry[] }>("agents.list", {})
      .then((res) => {
        if (cancelled) return;
        setAgents(res?.agents ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gw]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agents</DialogTitle>
          <DialogDescription>
            Registered agents and the model each uses. Read-only — manage with{" "}
            <code className="px-1 bg-muted rounded text-xs">openclaw agents</code>.
          </DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && agents.length === 0 && (
          <p className="text-sm text-muted-foreground">No agents reported.</p>
        )}
        {!loading && agents.length > 0 && (
          <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto no-scrollbar">
            {agents.map((a, i) => (
              <li
                key={a.id ?? i}
                className="border rounded-lg px-3 py-2.5 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">
                    {a.name ?? a.id ?? "agent"}
                  </span>
                  {a.thinking && (
                    <span className="text-[11px] text-muted-foreground">
                      thinking: {a.thinking}
                    </span>
                  )}
                </div>
                {a.id && a.id !== (a.name ?? "") && (
                  <code className="text-xs text-muted-foreground">{a.id}</code>
                )}
                {a.model?.primary && (
                  <code className="text-xs text-muted-foreground">
                    model: {a.model.primary}
                  </code>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Model Providers ----------

interface AuthProfilesResponse {
  raw?: string;
}

export function ProvidersDialog({
  open,
  onOpenChange,
  gw,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gw: GatewayWs | null;
}) {
  const [providers, setProviders] = useState<
    { id: string; provider: string; mode?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !gw) return;
    setLoading(true);
    let cancelled = false;
    gw.request<AuthProfilesResponse>("config.get", {})
      .then((res) => {
        if (cancelled) return;
        try {
          const cfg = res.raw ? JSON.parse(res.raw) : {};
          const profiles = (cfg?.auth?.profiles ?? {}) as Record<
            string,
            { provider?: string; mode?: string }
          >;
          setProviders(
            Object.entries(profiles).map(([id, v]) => ({
              id,
              provider: v.provider ?? id.split(":")[0] ?? "",
              mode: v.mode,
            })),
          );
        } catch {
          setProviders([]);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gw]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Model Providers</DialogTitle>
          <DialogDescription>
            Auth profiles known to your gateway. Read-only — run{" "}
            <code className="px-1 bg-muted rounded text-xs">openclaw configure</code>{" "}
            to add or rotate keys.
          </DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && providers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No provider profiles configured yet.
          </p>
        )}
        {!loading && providers.length > 0 && (
          <ul className="flex flex-col gap-2">
            {providers.map((p) => (
              <li
                key={p.id}
                className="border rounded-lg px-3 py-2.5 flex items-center justify-between gap-2"
              >
                <span className="font-medium text-sm capitalize">
                  {p.provider}
                </span>
                <code className="text-[11px] text-muted-foreground">
                  {p.mode ?? "configured"} · {p.id}
                </code>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Appearance ----------

export function AppearanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [theme, setTheme] = useTheme();
  const options: { id: Theme; label: string; icon: React.ReactNode }[] = [
    { id: "system", label: "System", icon: <Monitor size={16} /> },
    { id: "light", label: "Light", icon: <Sun size={16} /> },
    { id: "dark", label: "Dark", icon: <Moon size={16} /> },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Appearance</DialogTitle>
          <DialogDescription>
            Choose how the app looks. System follows your OS preference.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-2 py-4 rounded-lg border text-sm transition-colors",
                theme === opt.id
                  ? "border-ring bg-muted text-foreground"
                  : "border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- About ----------

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>About</DialogTitle>
          <DialogDescription>
            Open-source chat UI for OpenClaw gateways.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-4 text-sm">
          <dt className="text-muted-foreground">Package</dt>
          <dd>
            <code className="px-1.5 py-0.5 rounded bg-muted">@clawnify/chat</code>
          </dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd>
            <a
              href="https://github.com/clawnify/chat"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              github.com/clawnify/chat
            </a>
          </dd>
          <dt className="text-muted-foreground">Protocol</dt>
          <dd>
            OpenClaw Gateway WebSocket (v4) —{" "}
            <a
              href="https://docs.openclaw.ai"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              docs.openclaw.ai
            </a>
          </dd>
          <dt className="text-muted-foreground">License</dt>
          <dd>MIT</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          clawnify/chat is an independent client for the OpenClaw protocol.
          Built and maintained by{" "}
          <a
            href="https://clawnify.com"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Clawnify
          </a>
          ; shared with the OpenClaw community.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Shared helpers ----------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
