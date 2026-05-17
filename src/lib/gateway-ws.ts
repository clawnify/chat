/**
 * Lightweight WebSocket client for the OpenClaw Gateway protocol (v4).
 *
 * Accepts any gateway WS URL (ws:// or wss://, with port and optional path).
 * Handshake matches the openclaw-control-ui client id so the device is
 * auto-approved on gateways with `dangerouslyDisableDeviceAuth`.
 */

import { getOrCreateIdentity, signChallenge } from "./device-identity";

export class PairingRequiredError extends Error {
  constructor(message = "Device pairing required") {
    super(message);
    this.name = "PairingRequiredError";
  }
}

type Pending = {
  resolve: (payload: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type GatewayEvent = {
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: number;
};

export type EventHandler = (evt: GatewayEvent) => void;

export class GatewayWs {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private gatewayUrl: string | null = null;
  private gatewayToken: string | null = null;
  private autoReconnect = false;
  private reconnecting = false;
  private disposed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private eventHandler: EventHandler | null = null;
  private connectionChangeHandler: ((connected: boolean) => void) | null = null;

  onEvent(handler: EventHandler | null) {
    this.eventHandler = handler;
  }

  onConnectionChange(handler: ((connected: boolean) => void) | null) {
    this.connectionChangeHandler = handler;
  }

  /**
   * Connect to the gateway and complete the challenge handshake.
   *
   * @param gatewayUrl Full WS URL, e.g. `ws://127.0.0.1:18789` or `wss://magicdns.example.ts.net/`.
   * @param gatewayToken Shared-secret token from the gateway's auth config.
   */
  connect(gatewayUrl: string, gatewayToken: string): Promise<void> {
    this.gatewayUrl = gatewayUrl;
    this.gatewayToken = gatewayToken;
    return new Promise((resolve, reject) => {
      const wsUrl = normalizeWsUrl(gatewayUrl);
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Gateway connection timed out"));
      }, 15_000);

      ws.onclose = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket closed before connect"));
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket error"));
      };

      ws.onmessage = (ev) => {
        let msg: { type: string; event?: string; id?: string; ok?: boolean; payload?: unknown; error?: unknown };
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }

        if (msg.type === "event" && msg.event === "connect.challenge") {
          const challenge = msg.payload as { nonce?: string } | undefined;
          const nonce = challenge?.nonce ?? "";

          getOrCreateIdentity()
            .then((identity) =>
              signChallenge(identity, {
                clientId: "openclaw-control-ui",
                clientMode: "webchat",
                role: "operator",
                scopes: ["operator.read", "operator.write", "operator.admin", "operator.approvals"],
                token: gatewayToken,
                nonce,
              }),
            )
            .then((signed) => {
              const id = this.nextId();
              ws.send(
                JSON.stringify({
                  type: "req",
                  id,
                  method: "connect",
                  params: {
                    minProtocol: 4,
                    maxProtocol: 4,
                    client: {
                      id: "openclaw-control-ui",
                      version: "1.0.0",
                      platform: "web",
                      mode: "webchat",
                    },
                    role: "operator",
                    scopes: ["operator.read", "operator.write", "operator.admin", "operator.approvals"],
                    caps: ["tool-events"],
                    auth: { token: gatewayToken },
                    device: {
                      id: signed.deviceId,
                      publicKey: signed.publicKey,
                      signature: signed.signature,
                      signedAt: signed.signedAt,
                      nonce,
                    },
                    locale: navigator.language || "en-US",
                    userAgent: "clawnify-agent-control-ui/0.0.1",
                  },
                }),
              );
            })
            .catch((err) => {
              clearTimeout(timeout);
              ws.close();
              reject(err);
            });
          return;
        }

        if (msg.type === "res" && !this.pending.has(msg.id ?? "")) {
          clearTimeout(timeout);
          if (msg.ok) {
            ws.onmessage = this.handleMessage.bind(this);
            ws.onclose = () => {
              this.rejectAll("WebSocket closed");
              this.connectionChangeHandler?.(false);
              this.scheduleAutoReconnect();
            };
            ws.onerror = () => {
              this.rejectAll("WebSocket error");
            };
            resolve();
          } else {
            ws.close();
            const errStr = JSON.stringify(msg.error);
            if (/pairing|device.identity/i.test(errStr)) {
              reject(new PairingRequiredError(errStr));
            } else {
              reject(new Error(`Gateway auth failed: ${errStr}`));
            }
          }
          return;
        }
      };
    });
  }

  enableAutoReconnect() {
    this.autoReconnect = true;
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (!document.hidden && this.autoReconnect && !this.disposed) {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.scheduleAutoReconnect(500);
          }
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
  }

  private scheduleAutoReconnect(delayMs = 3000) {
    if (!this.autoReconnect || this.disposed || this.reconnecting || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.disposed || this.reconnecting) return;
      this.reconnecting = true;
      try {
        await this.reconnect();
      } catch {
        if (!this.disposed) this.scheduleAutoReconnect(Math.min(delayMs * 2, 30000));
      } finally {
        this.reconnecting = false;
      }
    }, delayMs);
  }

  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("Not connected"));
      }

      const id = this.nextId();
      const timeout = typeof params.timeoutMs === "number" ? params.timeoutMs + 5000 : 10_000;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request "${method}" timed out`));
      }, timeout);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.ws.send(JSON.stringify({ type: "req", id, method, params }));
    });
  }

  async reconnect(): Promise<void> {
    if (!this.gatewayUrl || !this.gatewayToken) {
      throw new Error("Cannot reconnect: no previous connection");
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    await this.connect(this.gatewayUrl, this.gatewayToken);
    this.connectionChangeHandler?.(true);
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    this.disposed = true;
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.rejectAll("Disconnected");
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(ev: MessageEvent) {
    let msg: { type: string; id?: string; event?: string; ok?: boolean; payload?: unknown; error?: unknown; seq?: number; stateVersion?: number };
    try {
      msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
    } catch {
      return;
    }

    if (msg.type === "res" && msg.id) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) {
        p.resolve(msg.payload);
      } else {
        p.reject(new Error(JSON.stringify(msg.error)));
      }
      return;
    }

    if (msg.type === "event" && msg.event && this.eventHandler) {
      this.eventHandler({
        event: msg.event,
        payload: msg.payload,
        seq: msg.seq,
        stateVersion: msg.stateVersion,
      });
    }
  }

  private nextId(): string {
    return `clw-${++this.seq}-${Date.now()}`;
  }

  private rejectAll(reason: string) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
      this.pending.delete(id);
    }
  }
}

/**
 * Accept user-friendly input and produce a canonical WS URL.
 * - `127.0.0.1:18789`             → `ws://127.0.0.1:18789/`
 * - `http://host:18789`           → `ws://host:18789/`
 * - `https://magicdns.ts.net`     → `wss://magicdns.ts.net/`
 * - `ws://...` / `wss://...`      → unchanged (path preserved)
 */
function normalizeWsUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) return trimmed;
  if (trimmed.startsWith("http://")) return "ws://" + trimmed.slice("http://".length);
  if (trimmed.startsWith("https://")) return "wss://" + trimmed.slice("https://".length);
  // Bare host:port — assume insecure (loopback default)
  const isLoopback = /^(127\.|localhost|::1)/.test(trimmed);
  return (isLoopback ? "ws://" : "wss://") + trimmed;
}
