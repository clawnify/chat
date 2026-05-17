#!/usr/bin/env node
// Minimal static server for the @clawnify/chat bundle.
// Uses Node built-ins only so the published package has zero runtime deps.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "dist");

const args = process.argv.slice(2);
let port = Number(process.env.PORT) || 5174;
let host = process.env.HOST || "127.0.0.1";
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--port" || a === "-p") port = Number(args[++i]);
  else if (a === "--host" || a === "-h") host = args[++i];
  else if (a === "--help") {
    console.log(`@clawnify/chat — local static server

Usage: clawnify-chat [--port 5174] [--host 127.0.0.1]

Once running, open the printed URL in your browser. Configure the gateway
URL + token in the settings screen, or pre-fill via the URL:

  http://localhost:5174/?gatewayUrl=ws://127.0.0.1:18789#token=<token>

The token lives in the URL fragment and never leaves your browser.
`);
    process.exit(0);
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

try {
  await stat(join(ROOT, "index.html"));
} catch {
  console.error(`error: dist/index.html not found at ${ROOT}`);
  console.error("If you're running from a clone, build first: pnpm build");
  process.exit(1);
}

async function send(res, path, fallback) {
  try {
    const data = await readFile(path);
    res.writeHead(200, {
      "Content-Type": MIME[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    if (fallback) return send(res, fallback);
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
}

const server = createServer(async (req, res) => {
  if (!req.url) return res.end();
  const url = new URL(req.url, `http://${host}`);

  // Local-only privileged endpoints (read openclaw.json, etc.). Loopback only,
  // regardless of --host: we never expose openclaw config or tokens to the network.
  if (url.pathname.startsWith("/__local/")) {
    if (!isLoopback(req.socket.remoteAddress)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "loopback only" }));
    }
    if (url.pathname === "/__local/gateway" && req.method === "GET") {
      const result = await detectLocalGateway();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(result));
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "unknown endpoint" }));
  }

  // Strip leading slash, normalize, prevent traversal
  const requested = normalize(url.pathname).replace(/^\/+/, "");
  const target = requested === "" ? "index.html" : requested;
  const fullPath = join(ROOT, target);

  // Block path traversal: target must resolve under ROOT.
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("forbidden");
  }

  // SPA fallback: if the path has no extension and isn't found, serve index.html.
  const hasExt = extname(target) !== "";
  await send(res, fullPath, hasExt ? null : join(ROOT, "index.html"));
});

function isLoopback(addr) {
  if (!addr) return false;
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

// Read ~/.openclaw/openclaw.json and extract a usable gateway URL + token.
// Strictly read-only. Returns `{ detected: false, reason }` on any failure so
// the UI can fall back to manual entry without surfacing internals.
async function detectLocalGateway() {
  const path = process.env.OPENCLAW_CONFIG || join(homedir(), ".openclaw", "openclaw.json");
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { detected: false, reason: "openclaw.json not found", source: path };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { detected: false, reason: "openclaw.json could not be parsed", source: path };
  }
  const gw = parsed?.gateway ?? {};
  const port = typeof gw.port === "number" && gw.port > 0 ? gw.port : 18789;

  // Token resolution: literal string, then SecretRef-style { source: "env", id }, then
  // the v2026.3.13+ default env var.
  let token = null;
  const authToken = gw?.auth?.token;
  if (typeof authToken === "string" && authToken.length > 0) {
    token = authToken;
  } else if (authToken && typeof authToken === "object" && authToken.source === "env" && typeof authToken.id === "string") {
    token = process.env[authToken.id] ?? null;
  }
  if (!token && process.env.OPENCLAW_GATEWAY_TOKEN) {
    token = process.env.OPENCLAW_GATEWAY_TOKEN;
  }

  return {
    detected: true,
    url: `ws://127.0.0.1:${port}`,
    hasToken: !!token,
    token: token || null,
    source: path,
  };
}

server.listen(port, host, () => {
  const url = `http://${host}:${port}/`;
  console.log(`@clawnify/chat ready at ${url}`);
  console.log("ctrl+c to stop");
});
