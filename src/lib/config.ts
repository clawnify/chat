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

const GATEWAY_URL_KEY = "clawnify-chat-gateway-url";
const TOKEN_KEY = "clawnify-chat-token";

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
