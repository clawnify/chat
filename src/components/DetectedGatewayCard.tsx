import type { DetectedGateway } from "../lib/config";

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
    <main className="detected">
      <div className="detected-card">
        <h2>Found a local OpenClaw gateway</h2>
        <dl>
          <dt>Gateway URL</dt>
          <dd>
            <code>{detected.url}</code>
          </dd>
          <dt>Token source</dt>
          <dd>
            <code>{detected.source}</code>
          </dd>
          <dt>Token</dt>
          <dd>
            {detected.hasToken ? (
              <span className="ok">read from your OpenClaw config</span>
            ) : (
              <span className="warn">no token found in config — enter it manually</span>
            )}
          </dd>
        </dl>

        <p className="detected-note">
          Nothing is sent anywhere. Click Connect to populate the form and start
          the gateway WebSocket from this browser tab. The token stays in
          memory unless you explicitly save it in settings.
        </p>

        <div className="actions">
          <button className="secondary" onClick={onUseSettings}>
            Enter manually
          </button>
          <button
            disabled={!canConnect}
            onClick={() => detected.token && onConnect(detected.url, detected.token)}
          >
            Connect
          </button>
        </div>
      </div>
    </main>
  );
}
