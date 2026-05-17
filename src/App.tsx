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
import {
  AboutDialog,
  AgentsDialog,
  AppearanceDialog,
  ConnectionDialog,
  ConnectionForm,
  ProvidersDialog,
  type SettingsSection,
} from "@/components/Settings";
import { Chat } from "@/components/Chat";
import { DetectedGatewayCard } from "@/components/DetectedGatewayCard";
import { SessionsSidebar } from "@/components/SessionsSidebar";
import {
  parseSessionFromPath,
  pushSessionPath,
  replaceSessionPath,
} from "@/lib/session-route";

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
  const [openDialog, setOpenDialog] = useState<SettingsSection | null>(null);
  const [detected, setDetected] = useState<DetectedGateway | null>(null);
  const [detectionResolved, setDetectionResolved] = useState(false);
  const [sessionKey, setSessionKey] = useState<string>(
    () => parseSessionFromPath(window.location.pathname) ?? DEFAULT_SESSION_KEY,
  );
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
        setOpenDialog("connection");
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

  // Session ↔ URL bridge.
  useEffect(() => {
    pushSessionPath(sessionKey);
  }, [sessionKey]);
  useEffect(() => {
    const onPop = () => {
      const fromPath = parseSessionFromPath(window.location.pathname);
      setSessionKey(fromPath ?? DEFAULT_SESSION_KEY);
    };
    window.addEventListener("popstate", onPop);
    replaceSessionPath(sessionKey);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave(nextUrl: string, nextToken: string, persistToken: boolean) {
    saveGatewayUrl(nextUrl);
    if (persistToken) saveToken(nextToken);
    else clearToken();
    setGatewayUrl(nextUrl);
    setToken(nextToken);
    setOpenDialog(null);
    setConn({ kind: "idle" });
  }

  function handleNewSession() {
    const shortId = crypto.randomUUID().slice(0, 8);
    setSessionKey(`agent:main:scratch:${shortId}`);
  }

  const isSetupTime = !gatewayUrl || !token || conn.kind !== "connected";

  // Setup-time (no gateway yet): show the connection form inline as the
  // whole screen — there's no chat layout to overlay against.
  if (openDialog === "connection" && isSetupTime) {
    return (
      <div className="h-full flex flex-col mx-auto max-w-2xl p-8">
        <h1 className="text-base font-medium mb-4">Connect to a gateway</h1>
        <ConnectionForm
          initialUrl={gatewayUrl ?? ""}
          initialToken={token ?? ""}
          onSave={handleSave}
          onCancel={() => setOpenDialog(null)}
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
          setOpenDialog("connection");
        }}
      />
    );
  }

  if (!detectionResolved) {
    return <EmptyState title="Looking for a local gateway…" />;
  }

  if (conn.kind !== "connected" || !gwRef.current) {
    return (
      <ConnStatus state={conn} onOpenSettings={() => setOpenDialog("connection")} />
    );
  }

  return (
    <div className="h-full flex">
      <SessionsSidebar
        gw={gwRef.current}
        activeKey={sessionKey}
        onSelect={setSessionKey}
        onNew={handleNewSession}
        onOpenSection={setOpenDialog}
        connState={conn.kind}
      />
      <Chat gw={gwRef.current} sessionKey={sessionKey} />

      <ConnectionDialog
        open={openDialog === "connection"}
        onOpenChange={(v) => setOpenDialog(v ? "connection" : null)}
        initialUrl={gatewayUrl ?? ""}
        initialToken={token ?? ""}
        onSave={handleSave}
      />
      <AgentsDialog
        open={openDialog === "agents"}
        onOpenChange={(v) => setOpenDialog(v ? "agents" : null)}
        gw={gwRef.current}
      />
      <ProvidersDialog
        open={openDialog === "providers"}
        onOpenChange={(v) => setOpenDialog(v ? "providers" : null)}
        gw={gwRef.current}
      />
      <AppearanceDialog
        open={openDialog === "appearance"}
        onOpenChange={(v) => setOpenDialog(v ? "appearance" : null)}
      />
      <AboutDialog
        open={openDialog === "about"}
        onOpenChange={(v) => setOpenDialog(v ? "about" : null)}
      />
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
            then{" "}
            <code className="px-1 bg-muted rounded">openclaw devices approve &lt;id&gt;</code>.
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
