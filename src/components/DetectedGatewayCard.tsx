import type { DetectedGateway } from "@/lib/config";

export function DetectedGatewayCard({
  detected,
  onConnect,
  onUseSettings,
}: {
  detected: DetectedGateway;
  onConnect: (url: string, token: string) => void;
  onUseSettings: () => void;
}) {
  const canConnect = detected.hasToken && detected.token !== null;

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-xl rounded-xl border bg-card text-card-foreground p-6 flex flex-col gap-4 shadow-sm">
        <h2 className="text-base font-medium">Found a local OpenClaw gateway</h2>

        <dl className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-4 text-sm">
          <dt className="text-muted-foreground">Gateway URL</dt>
          <dd>
            <code className="px-1.5 py-0.5 rounded bg-muted">
              {detected.url}
            </code>
          </dd>
          <dt className="text-muted-foreground">Token source</dt>
          <dd>
            <code className="px-1.5 py-0.5 rounded bg-muted text-xs break-all">
              {detected.source}
            </code>
          </dd>
          <dt className="text-muted-foreground">Token</dt>
          <dd>
            {detected.hasToken ? (
              <span className="text-emerald-500">
                read from your OpenClaw config
              </span>
            ) : (
              <span className="text-amber-500">
                no token found in config — enter it manually
              </span>
            )}
          </dd>
        </dl>

        <p className="text-sm text-muted-foreground">
          Nothing is sent anywhere. Click Connect to start the gateway
          WebSocket from this browser tab. The token stays in memory unless
          you explicitly save it in settings.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onUseSettings}
            className="px-3 py-1.5 rounded-md text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Enter manually
          </button>
          <button
            type="button"
            disabled={!canConnect}
            onClick={() => detected.token && onConnect(detected.url, detected.token)}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Connect
          </button>
        </div>
      </div>
    </main>
  );
}
