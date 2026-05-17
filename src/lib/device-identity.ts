/**
 * Ed25519 device identity for OpenClaw Gateway WebSocket authentication.
 *
 * Matches the server-side derivation in openclaw/src/infra/device-identity.ts:
 * - deviceId = SHA-256(rawPublicKey).hex() (full 64-char hex)
 * - publicKey = base64url(rawPublicKey)
 * - signature = base64url(Ed25519Sign(payload))
 */

const STORAGE_KEY = "agent-control-ui-device-identity";

export interface DeviceIdentity {
  deviceId: string;
  publicKeyB64Url: string;
  privateKeyB64: string;
}

export interface SignedIdentity {
  deviceId: string;
  publicKey: string;
  signature: string;
  signedAt: number;
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function deriveDeviceId(publicKeyRaw: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", publicKeyRaw);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getOrCreateIdentity(): Promise<DeviceIdentity> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as DeviceIdentity;
      if (parsed.deviceId && parsed.publicKeyB64Url && parsed.privateKeyB64) {
        return parsed;
      }
    } catch {
      // Corrupted — regenerate
    }
  }

  const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyPkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  const deviceId = await deriveDeviceId(publicKeyRaw);
  const identity: DeviceIdentity = {
    deviceId,
    publicKeyB64Url: toBase64Url(publicKeyRaw),
    privateKeyB64: toBase64(privateKeyPkcs8),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export async function signChallenge(
  identity: DeviceIdentity,
  params: {
    clientId: string;
    clientMode: string;
    role: string;
    scopes: string[];
    token: string;
    nonce: string;
  },
): Promise<SignedIdentity> {
  const signedAt = Date.now();
  const payload = [
    "v2",
    identity.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    signedAt.toString(),
    params.token,
    params.nonce,
  ].join("|");

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    fromBase64(identity.privateKeyB64).buffer as ArrayBuffer,
    "Ed25519",
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    new TextEncoder().encode(payload),
  );

  return {
    deviceId: identity.deviceId,
    publicKey: identity.publicKeyB64Url,
    signature: toBase64Url(signature),
    signedAt,
  };
}
