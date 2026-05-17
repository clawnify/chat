import { useState, type FormEvent } from "react";
import { Monitor, Moon, Plug, Sun, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/lib/theme";

type SettingsSection = "connection" | "appearance" | "about";

export function Settings({
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
  const [section, setSection] = useState<SettingsSection>("connection");

  return (
    <div className="flex h-[480px] -mx-6 -mb-6 -mt-2 border-t">
      <SettingsSidebar section={section} onChange={setSection} />
      <div className="flex-1 overflow-y-auto p-6">
        {section === "connection" && (
          <ConnectionSection
            initialUrl={initialUrl}
            initialToken={initialToken}
            onSave={onSave}
            onCancel={onCancel}
          />
        )}
        {section === "appearance" && <AppearanceSection />}
        {section === "about" && <AboutSection />}
      </div>
    </div>
  );
}

function SettingsSidebar({
  section,
  onChange,
}: {
  section: SettingsSection;
  onChange: (s: SettingsSection) => void;
}) {
  const items: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: "connection", label: "Connection", icon: <Plug size={14} /> },
    { id: "appearance", label: "Appearance", icon: <Monitor size={14} /> },
    { id: "about", label: "About", icon: <Info size={14} /> },
  ];
  return (
    <nav className="w-44 shrink-0 border-r p-2 flex flex-col gap-0.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
            section === it.id
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </nav>
  );
}

const inputClass =
  "w-full bg-background border border-input rounded-md px-3 py-2 text-sm font-mono " +
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function ConnectionSection({
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
      <SectionHeader
        title="Connection"
        description="OpenClaw gateway URL and shared-secret token."
      />

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

function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  const options: { id: Theme; label: string; icon: React.ReactNode }[] = [
    { id: "system", label: "System", icon: <Monitor size={16} /> },
    { id: "light", label: "Light", icon: <Sun size={16} /> },
    { id: "dark", label: "Dark", icon: <Moon size={16} /> },
  ];
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Appearance"
        description="Choose how the app looks. System follows your OS preference."
      />
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
    </div>
  );
}

function AboutSection() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="About"
        description="Open-source chat UI for OpenClaw gateways."
      />
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
      <p className="text-xs text-muted-foreground pt-4">
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
    </div>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

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
