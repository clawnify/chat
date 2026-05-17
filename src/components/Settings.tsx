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
    <main className="settings">
      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">Gateway URL</span>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            placeholder="ws://127.0.0.1:18789"
            autoFocus
            spellCheck={false}
          />
          <span className="field-hint">
            Accepts <code>ws://</code>, <code>wss://</code>, <code>http://</code>, <code>https://</code>, or a bare
            <code>host:port</code>.
          </span>
        </label>

        <label className="field">
          <span className="field-label">Gateway token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
            placeholder="shared secret from gateway.auth.token"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="field-hint">
            Configured in the gateway’s <code>~/.openclaw/openclaw.json</code> under{" "}
            <code>gateway.auth.token</code>.
          </span>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={persistToken}
            onChange={(e) => setPersistToken(e.currentTarget.checked)}
          />
          <span>Remember token in this browser (localStorage)</span>
        </label>

        <div className="actions">
          <button type="button" onClick={onCancel} className="secondary">
            Cancel
          </button>
          <button type="submit" disabled={!url.trim() || !token.trim()}>
            Connect
          </button>
        </div>
      </form>
    </main>
  );
}
