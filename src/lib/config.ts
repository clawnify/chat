/**
 * Bootstrap config from URL fragment / localStorage.
 *
 * Convention matches upstream Control UI dev mode:
 *   http://localhost:5173/?gatewayUrl=ws://127.0.0.1:18789#token=abc123
 *
 * - `gatewayUrl` arrives as query param, gets stripped after import.
 * - `token` arrives in the URL fragment (never sent to server), kept in memory
 *   only unless the user opts to persist it.
 */

const GATEWAY_URL_KEY = "agent-control-ui-gateway-url";
const TOKEN_KEY = "agent-control-ui-token";

export interface ChatConfig {
  gatewayUrl: string | null;
  token: string | null;
  /** True when the token was loaded from localStorage (vs URL fragment). */
  tokenPersisted: boolean;
}

export function bootstrapConfig(): ChatConfig {
  let gatewayUrl: string | null = null;
  let token: string | null = null;
  let tokenPersisted = false;

  // URL fragment first (highest priority, never sent to server)
  if (window.location.hash) {
    const frag = new URLSearchParams(window.location.hash.slice(1));
    const t = frag.get("token");
    if (t) token = t;
    // Strip the fragment so the token doesn't linger in the address bar
    if (t) history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  // Query param gatewayUrl (one-shot import, like upstream Control UI)
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get("gatewayUrl");
  if (urlParam) {
    gatewayUrl = urlParam;
    localStorage.setItem(GATEWAY_URL_KEY, urlParam);
    params.delete("gatewayUrl");
    const newSearch = params.toString();
    history.replaceState(null, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
  }

  // Fall back to localStorage
  if (!gatewayUrl) gatewayUrl = localStorage.getItem(GATEWAY_URL_KEY);
  if (!token) {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      token = stored;
      tokenPersisted = true;
    }
  }

  return { gatewayUrl, token, tokenPersisted };
}

export function saveGatewayUrl(url: string) {
  localStorage.setItem(GATEWAY_URL_KEY, url);
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function clearConfig() {
  localStorage.removeItem(GATEWAY_URL_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export interface DetectedGateway {
  detected: true;
  url: string;
  hasToken: boolean;
  token: string | null;
  source: string;
}

export interface UndetectedGateway {
  detected: false;
  reason: string;
  source?: string;
}

/**
 * Ask the CLI host (bin/agent-control-ui.mjs) whether a local OpenClaw gateway is
 * configured. Loopback-only on the CLI side; the UI never sees a token unless
 * the user opened the page from the same machine.
 *
 * Returns null when the CLI host isn't reachable — i.e. when the UI is being
 * served from `pnpm dev` (Vite) instead of the production CLI.
 */
export async function detectLocalGateway(): Promise<DetectedGateway | UndetectedGateway | null> {
  try {
    const res = await fetch("/__local/gateway", { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as DetectedGateway | UndetectedGateway;
    return data;
  } catch {
    return null;
  }
}
