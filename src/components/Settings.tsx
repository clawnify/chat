import { useState, type FormEvent } from "react";

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
  const [url, setUrl] = useState(initialUrl);
  const [token, setToken] = useState(initialToken);
  const [persistToken, setPersistToken] = useState(initialToken.length > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || !token.trim()) return;
    onSave(url.trim(), token.trim(), persistToken);
  }

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <form onSubmit={submit} className="mx-auto max-w-xl flex flex-col gap-5">
        <Field
          label="Gateway URL"
          hint={
            <>
              Accepts <code className="px-1 bg-muted rounded">ws://</code>,{" "}
              <code className="px-1 bg-muted rounded">wss://</code>,{" "}
              <code className="px-1 bg-muted rounded">http://</code>,{" "}
              <code className="px-1 bg-muted rounded">https://</code>, or a
              bare <code className="px-1 bg-muted rounded">host:port</code>.
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
              Configured in your gateway’s{" "}
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
    </main>
  );
}

const inputClass =
  "w-full bg-background border border-input rounded-md px-3 py-2 text-sm font-mono " +
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

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
