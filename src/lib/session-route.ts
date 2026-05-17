/**
 * Tiny URL ↔ sessionKey bridge. No router dep — just history.pushState +
 * popstate. URL shape: `/s/<encoded-sessionKey>`. Anything outside that
 * prefix maps to the default session.
 */

const PREFIX = "/chat/";

export function parseSessionFromPath(pathname: string): string | null {
  if (!pathname.startsWith(PREFIX)) return null;
  const encoded = pathname.slice(PREFIX.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function pathForSession(sessionKey: string): string {
  return PREFIX + encodeURIComponent(sessionKey);
}

export function pushSessionPath(sessionKey: string) {
  const next = pathForSession(sessionKey);
  if (window.location.pathname === next) return;
  window.history.pushState({ sessionKey }, "", next);
}

export function replaceSessionPath(sessionKey: string) {
  const next = pathForSession(sessionKey);
  if (window.location.pathname === next) return;
  window.history.replaceState({ sessionKey }, "", next);
}
