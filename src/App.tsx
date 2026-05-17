import { useEffect, useRef, useState } from "react";
import { GatewayWs, PairingRequiredError } from "./lib/gateway-ws";
import {
  bootstrapConfig,
  clearToken,
  detectLocalGateway,
  saveGatewayUrl,
  saveToken,
  type DetectedGateway,
} from "./lib/config";
import { Settings } from "./components/Settings";
import { Chat } from "./components/Chat";
import { DetectedGatewayCard } from "./components/DetectedGatewayCard";

type ConnState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "error"; message: string; pairingRequired?: boolean };

export function App() {
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnState>({ kind: "idle" });
  const [showSettings, setShowSettings] = useState(false);
  const [detected, setDetected] = useState<DetectedGateway | null>(null);
  const [detectionResolved, setDetectionResolved] = useState(false);
  const gwRef = useRef<GatewayWs | null>(null);

  // Bootstrap on mount: load saved config + offer a local-gateway detection
  // when no saved config exists. Detection is an explicit consent step — we
  // never auto-connect.
  useEffect(() => {
    const cfg = bootstrapConfig();
    setGatewayUrl(cfg.gatewayUrl);
    setToken(cfg.token);

    if (cfg.gatewayUrl && cfg.token) {
      setDetectionResolved(true);
      return;
    }

    detectLocalGateway().then((res) => {
      if (res && res.detected && res.hasToken && res.token) {
        setDetected(res);
      } else {
        // Nothing usable to offer — fall through to manual settings.
        setShowSettings(true);
      }
      setDetectionResolved(true);
    });
  }, []);

  // Connect when we have both
  useEffect(() => {
    if (!gatewayUrl || !token) return;
    if (conn.kind === "connecting" || conn.kind === "connected") return;

    const gw = new GatewayWs();
    gwRef.current = gw;
    setConn({ kind: "connecting" });

    gw.connect(gatewayUrl, token)
      .then(() => {
        gw.enableAutoReconnect();
        setConn({ kind: "connected" });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setConn({
          kind: "error",
          message,
          pairingRequired: err instanceof PairingRequiredError,
        });
      });

    return () => {
      gw.disconnect();
      gwRef.current = null;
    };
    // Only reconnect when the credentials themselves change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayUrl, token]);

  function handleSave(nextUrl: string, nextToken: string, persistToken: boolean) {
    saveGatewayUrl(nextUrl);
    if (persistToken) saveToken(nextToken);
    else clearToken();
    setGatewayUrl(nextUrl);
    setToken(nextToken);
    setShowSettings(false);
    setConn({ kind: "idle" });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">clawnify/chat</span>
          <ConnBadge state={conn} />
        </div>
        <button className="settings-btn" onClick={() => setShowSettings((s) => !s)}>
          Settings
        </button>
      </header>

      {showSettings ? (
        <Settings
          initialUrl={gatewayUrl ?? ""}
          initialToken={token ?? ""}
          onSave={handleSave}
          onCancel={() => setShowSettings(false)}
        />
      ) : detected && !gatewayUrl && !token ? (
        <DetectedGatewayCard
          detected={detected}
          onConnect={(url, tok) => {
            // Honor the no-silent-config rule: don't write to localStorage
            // when the source of truth is the user's openclaw.json. Re-detect
            // on every reload.
            setDetected(null);
            setGatewayUrl(url);
            setToken(tok);
            setConn({ kind: "idle" });
          }}
          onUseSettings={() => {
            setDetected(null);
            setShowSettings(true);
          }}
        />
      ) : !detectionResolved ? (
        <main className="empty">
          <h2>Looking for a local gateway…</h2>
        </main>
      ) : conn.kind === "connected" && gwRef.current ? (
        <Chat gw={gwRef.current} />
      ) : (
        <ConnStatus state={conn} onOpenSettings={() => setShowSettings(true)} />
      )}
    </div>
  );
}

function ConnBadge({ state }: { state: ConnState }) {
  const labels: Record<ConnState["kind"], string> = {
    idle: "idle",
    connecting: "connecting…",
    connected: "connected",
    error: "error",
  };
  return <span className={`badge badge-${state.kind}`}>{labels[state.kind]}</span>;
}

function ConnStatus({ state, onOpenSettings }: { state: ConnState; onOpenSettings: () => void }) {
  if (state.kind === "idle") {
    return (
      <main className="empty">
        <h2>No gateway configured</h2>
        <p>Set the gateway URL and shared-secret token to start chatting.</p>
        <button onClick={onOpenSettings}>Open settings</button>
      </main>
    );
  }
  if (state.kind === "connecting") {
    return (
      <main className="empty">
        <h2>Connecting…</h2>
      </main>
    );
  }
  if (state.kind === "error") {
    return (
      <main className="empty">
        <h2>Couldn’t connect</h2>
        <pre className="error-detail">{state.message}</pre>
        {state.pairingRequired && (
          <p>
            This browser hasn’t been paired with the gateway. On the gateway host run{" "}
            <code>openclaw devices list</code> then <code>openclaw devices approve &lt;id&gt;</code>.
          </p>
        )}
        <button onClick={onOpenSettings}>Edit settings</button>
      </main>
    );
  }
  return null;
}
