import { useEffect, useRef, useState } from "react";
import { GatewayWs, PairingRequiredError } from "@/lib/gateway-ws";
import {
  bootstrapConfig,
  clearToken,
  detectLocalGateway,
  saveGatewayUrl,
  saveToken,
  type DetectedGateway,
} from "@/lib/config";
import { cn } from "@/lib/utils";
import { Settings } from "@/components/Settings";
import { Chat } from "@/components/Chat";
import { DetectedGatewayCard } from "@/components/DetectedGatewayCard";

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
        setShowSettings(true);
      }
      setDetectionResolved(true);
    });
  }, []);

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
    <div className="flex h-full flex-col mx-auto max-w-3xl">
      <header className="flex items-center justify-between px-5 py-3 border-b">
        <div className="flex items-center gap-3">
          <span className="font-mono font-medium">clawnify/chat</span>
          <ConnBadge state={conn} />
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          className="px-3 py-1.5 rounded-md text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
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
        <EmptyState title="Looking for a local gateway…" />
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
  const tone: Record<ConnState["kind"], string> = {
    idle: "text-muted-foreground border-border",
    connecting: "text-amber-500 border-amber-500/40",
    connected: "text-emerald-500 border-emerald-500/40",
    error: "text-destructive border-destructive/40",
  };
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full border",
        tone[state.kind],
      )}
    >
      {labels[state.kind]}
    </span>
  );
}

function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center">
      <h2 className="text-base font-medium">{title}</h2>
      {children}
    </main>
  );
}

function ConnStatus({
  state,
  onOpenSettings,
}: {
  state: ConnState;
  onOpenSettings: () => void;
}) {
  if (state.kind === "idle") {
    return (
      <EmptyState title="No gateway configured">
        <p className="text-sm text-muted-foreground max-w-md">
          Set the gateway URL and shared-secret token to start chatting.
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Open settings
        </button>
      </EmptyState>
    );
  }
  if (state.kind === "connecting") {
    return <EmptyState title="Connecting…" />;
  }
  if (state.kind === "error") {
    return (
      <EmptyState title="Couldn’t connect">
        <pre className="max-w-md text-left text-xs text-destructive bg-muted p-3 rounded-md whitespace-pre-wrap break-all">
          {state.message}
        </pre>
        {state.pairingRequired && (
          <p className="text-sm text-muted-foreground max-w-md">
            This browser hasn’t been paired with the gateway. On the gateway
            host run <code className="px-1 bg-muted rounded">openclaw devices list</code>{" "}
            then <code className="px-1 bg-muted rounded">openclaw devices approve &lt;id&gt;</code>.
          </p>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          className="px-3 py-1.5 rounded-md text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          Edit settings
        </button>
      </EmptyState>
    );
  }
  return null;
}
