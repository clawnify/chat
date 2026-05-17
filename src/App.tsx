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
import { Settings } from "@/components/Settings";
import { Chat } from "@/components/Chat";
import { DetectedGatewayCard } from "@/components/DetectedGatewayCard";
import { SessionsSidebar } from "@/components/SessionsSidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type ConnState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "error"; message: string; pairingRequired?: boolean };

const DEFAULT_SESSION_KEY = "agent:main:main";

export function App() {
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnState>({ kind: "idle" });
  const [showSettings, setShowSettings] = useState(false);
  const [detected, setDetected] = useState<DetectedGateway | null>(null);
  const [detectionResolved, setDetectionResolved] = useState(false);
  const [sessionKey, setSessionKey] = useState<string>(DEFAULT_SESSION_KEY);
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

  function handleNewSession() {
    // Generate a fresh sessionKey under the main agent. OpenClaw materializes
    // the session lazily on the first chat.send to a new key (see
    // docs/openclaw/gateway/PROTOCOL.md and the scope-key convention).
    const shortId = crypto.randomUUID().slice(0, 8);
    const newKey = `agent:main:scratch:${shortId}`;
    setSessionKey(newKey);
  }

  // Setup-time settings (no gateway yet) — render Settings inline since
  // there's nothing else on screen.
  const isSetupTime = !gatewayUrl || !token || conn.kind !== "connected";
  if (showSettings && isSetupTime) {
    return (
      <div className="h-full flex flex-col mx-auto max-w-2xl">
        <Settings
          initialUrl={gatewayUrl ?? ""}
          initialToken={token ?? ""}
          onSave={handleSave}
          onCancel={() => setShowSettings(false)}
        />
      </div>
    );
  }

  if (detected && !gatewayUrl && !token) {
    return (
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
    );
  }

  if (!detectionResolved) {
    return <EmptyState title="Looking for a local gateway…" />;
  }

  if (conn.kind !== "connected" || !gwRef.current) {
    return (
      <ConnStatus state={conn} onOpenSettings={() => setShowSettings(true)} />
    );
  }

  // Connected — two-column layout matches the reference design. Settings
  // opens as a shadcn Dialog over the layout.
  return (
    <div className="h-full flex">
      <SessionsSidebar
        gw={gwRef.current}
        activeKey={sessionKey}
        onSelect={setSessionKey}
        onNew={handleNewSession}
        onOpenSettings={() => setShowSettings(true)}
        connState={conn.kind}
      />
      <Chat gw={gwRef.current} sessionKey={sessionKey} />

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Configure the connection, appearance, and other preferences.
            </DialogDescription>
          </DialogHeader>
          <Settings
            initialUrl={gatewayUrl ?? ""}
            initialToken={token ?? ""}
            onSave={handleSave}
            onCancel={() => setShowSettings(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
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
    <main className="h-full flex flex-col items-center justify-center gap-3 p-10 text-center">
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
  if (state.kind === "connecting") return <EmptyState title="Connecting…" />;
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
