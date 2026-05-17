/**
 * Pure protocol parsers + state machine for OpenClaw gateway WS payloads.
 *
 * Nothing in this module touches React or the DOM. Eventually a candidate for
 * extraction into `@clawnify/chat-core`. Ported from chat-panel.tsx and kept
 * deliberately close to the upstream parsing semantics — see the
 * "parseApprovalFromToolResult" regex comment in particular.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Message {
  role: "user" | "assistant" | "system" | "action";
  content: string;
  /** True while the assistant is still streaming */
  streaming?: boolean;
  /** True for user messages added optimistically before server confirmation */
  optimistic?: boolean;
  /** Error type — apiKey for auth, rateLimit for quota/overload, etc. */
  errorType?: ErrorType;
  /** role === "action" — tool name */
  toolName?: string;
  /** role === "action" — tool-call id, used for result correlation + approvals */
  toolCallId?: string;
  /** role === "action" — text result returned by the tool */
  toolResult?: string;
  /** role === "action" — true when the tool reported isError */
  toolError?: boolean;
  /** role === "action" — raw structured arguments */
  toolArgs?: Record<string, unknown>;
  /** assistant thinking/reasoning text (type: "thinking" content blocks) */
  thinking?: string;
}

export type ErrorType = "apiKey" | "rateLimit" | "providerMismatch" | "generic";

export interface PendingApproval {
  approvalId: string;
  /** "exec" for shell-command approvals, "plugin" for plugin-tool approvals */
  kind?: "exec" | "plugin";
  /** Exec command — only set when kind === "exec" */
  command?: string;
  cwd?: string;
  agentId?: string;
  resolvedPath?: string;
  host?: string;
  /** Plugin approval display fields — only set when kind === "plugin" */
  title?: string;
  description?: string;
  toolName?: string;
  pluginId?: string;
  /** "pending" | "allow-once" | "allow-always" | "deny" | "expired" */
  status: string;
  timestamp: number;
  expiresAt?: number;
  /** Links approval to the exec/plugin tool-call message that triggered it */
  toolCallId?: string;
}

// ---------------------------------------------------------------------------
// Content-block extraction
// ---------------------------------------------------------------------------

/** Plain text from OpenClaw content (array of blocks or string). */
export function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: Record<string, unknown>) => b.type === "text")
      .map((b: Record<string, unknown>) => b.text as string)
      .join("");
  }
  return "";
}

/** Thinking/reasoning text from { type: "thinking", thinking: "..." } blocks. */
export function extractThinking(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b: Record<string, unknown>) =>
        b.type === "thinking" && typeof b.thinking === "string",
    )
    .map((b: Record<string, unknown>) => (b.thinking as string).trim())
    .filter(Boolean)
    .join("\n");
}

/** Human-readable summary of tool arguments for action labels. */
export function summarizeArgs(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  switch (toolName) {
    case "exec":
      return typeof a.command === "string" ? a.command : "";
    case "browser": {
      const action = (a.action as string) || "";
      const url = (a.url as string) || "";
      const ref = a.ref != null ? `ref=${a.ref}` : "";
      const value = typeof a.value === "string" ? a.value : "";
      return [action, url, ref, value].filter(Boolean).join(" ");
    }
    default: {
      const firstStr = Object.values(a).find((v) => typeof v === "string") as
        | string
        | undefined;
      if (firstStr) {
        return firstStr.length > 120 ? firstStr.slice(0, 120) + "..." : firstStr;
      }
      const json = JSON.stringify(a);
      return json.length > 120 ? json.slice(0, 120) + "..." : json;
    }
  }
}

/** Tool calls from OpenClaw assistant content blocks. */
export function extractToolCalls(
  content: unknown,
): { id: string; name: string; args: string }[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b: Record<string, unknown>) => b.type === "toolCall")
    .map((b: Record<string, unknown>) => ({
      id: b.id as string,
      name: b.name as string,
      args: summarizeArgs(b.name as string, b.arguments),
    }));
}

/** Strip OpenClaw metadata envelopes from visible message text. */
export function stripMetadata(text: string): string {
  return text
    .replace(/---+\s*Conversation info \(untrusted metadata\)[\s\S]*?---+/g, "")
    .replace(/Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/g, "")
    .replace(/System:.*?\n/g, "")
    .replace(/\[chat\.history omitted: message too large\]/g, "[message too large]")
    .replace(/^\[\w{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\]\s*/gm, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Skippable / system-generated user messages
// ---------------------------------------------------------------------------

/** Patterns that identify system-generated user messages (heartbeats, resets). */
export const SYSTEM_USER_PATTERNS = [
  "HEARTBEAT",
  "Session Startup sequence",
  "A new session was started via /new",
  "A new session was started via /reset",
  "An async command the user already approved has completed",
  "An async command did not run",
  "OpenClaw runtime context (internal)",
];

function isSkippable(entry: Record<string, unknown>): boolean {
  // Delivery-mirror messages (media notifications) — not displayed
  if (entry.provider === "openclaw" && entry.model === "delivery-mirror") return true;
  return false;
}

function isSystemUserMessage(entry: Record<string, unknown>): boolean {
  const raw = extractText(entry.content);
  return SYSTEM_USER_PATTERNS.some((p) => raw.includes(p));
}

// ---------------------------------------------------------------------------
// History parsing
// ---------------------------------------------------------------------------

/** Parse messages from a chat.history response payload. */
export function parseHistory(payload: unknown): Message[] {
  const data = payload as Record<string, unknown> | null;
  if (!data) return [];

  const entries = data.messages as unknown[] | undefined;
  if (!Array.isArray(entries)) {
    if (Array.isArray(payload)) return parseHistoryEntries(payload);
    return [];
  }
  return parseHistoryEntries(entries);
}

/**
 * Convert raw history entries to displayable Messages.
 *
 * Handles heartbeat turn elision, system-user-message hiding, interleaved
 * text/toolCall blocks, toolResult correlation, and error-message rendering.
 */
export function parseHistoryEntries(entries: unknown[]): Message[] {
  const msgs: Message[] = [];
  let inHeartbeatTurn = false;

  for (const entry of entries) {
    const e = entry as Record<string, unknown>;
    const role = e.role as string;

    if (role === "user" || role === "assistant") {
      if (isSkippable(e)) continue;

      if (role === "user" && isSystemUserMessage(e)) {
        inHeartbeatTurn = extractText(e.content).includes("HEARTBEAT");
        continue;
      }

      if (role === "user") inHeartbeatTurn = false;
      if (role === "assistant" && inHeartbeatTurn) continue;

      // Preserve interleaved text + toolCall ordering.
      if (role === "assistant" && Array.isArray(e.content)) {
        const thinking = extractThinking(e.content);
        let textAcc = "";
        let hasEmitted = false;

        const flushText = () => {
          const cleaned = stripMetadata(textAcc).trim();
          if (cleaned && cleaned !== "NO_REPLY") {
            msgs.push({
              role: "assistant",
              content: cleaned,
              ...(thinking && !hasEmitted ? { thinking } : {}),
            });
            hasEmitted = true;
          } else if (thinking && !hasEmitted) {
            msgs.push({ role: "assistant", content: "", thinking });
            hasEmitted = true;
          }
          textAcc = "";
        };

        for (const block of e.content as Record<string, unknown>[]) {
          if (block.type === "text") {
            textAcc += block.text as string;
          } else if (block.type === "toolCall") {
            flushText();
            msgs.push({
              role: "action",
              content: summarizeArgs(block.name as string, block.arguments),
              toolName: block.name as string,
              toolCallId: block.id as string,
              toolArgs:
                block.arguments && typeof block.arguments === "object"
                  ? (block.arguments as Record<string, unknown>)
                  : undefined,
            });
          }
        }
        flushText();
        continue;
      }

      const text = stripMetadata(extractText(e.content));
      const thinking = role === "assistant" ? extractThinking(e.content) : "";
      if ((!text || text === "NO_REPLY") && !thinking) continue;
      msgs.push({
        role: role as "user" | "assistant",
        content: text || "",
        ...(thinking ? { thinking } : {}),
      });
      continue;
    }

    if (role === "toolResult") {
      if (inHeartbeatTurn) continue;
      const callId = e.toolCallId as string;
      const action = msgs.findLast((m) => m.toolCallId === callId);
      if (action) {
        action.toolResult = extractText(e.content);
        action.toolError = e.isError === true;
      }
      continue;
    }
  }

  // Surface a terminal error if the last assistant entry stopped with one.
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as Record<string, unknown>;
    if (e.role !== "assistant") continue;
    if (e.stopReason === "error" && e.errorMessage) {
      const raw = e.errorMessage as string;
      const errorType = classifyError(raw);
      msgs.push({
        role: "assistant",
        content: formatErrorMessage(raw, errorType, e.model as string | undefined),
        errorType,
      });
    }
    break;
  }

  return msgs;
}

// ---------------------------------------------------------------------------
// Run-state predicates
// ---------------------------------------------------------------------------

/** True when stopReason === "toolUse" — agent paused for a tool, user can nudge. */
export function isWaitingForToolUse(payload: unknown): boolean {
  const data = payload as Record<string, unknown> | null;
  if (!data) return false;
  const entries =
    (data.messages as unknown[] | undefined) ??
    (Array.isArray(payload) ? (payload as unknown[]) : []);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as Record<string, unknown>;
    if (e.role === "assistant") return e.stopReason === "toolUse";
    if (e.role === "user") return false;
    if (e.role === "toolResult") return false;
  }
  return false;
}

/**
 * Best-effort check of whether the agent is mid-run. Prefers session.status if
 * the gateway provided it; otherwise inspects the last few entries.
 */
export function isAgentRunning(payload: unknown): boolean {
  const data = payload as Record<string, unknown> | null;
  if (!data) return false;

  const session = data.session as Record<string, unknown> | undefined;
  const status = session?.status as string | undefined;
  if (status === "running") return true;
  if (status === "done" || status === "idle") return false;

  const entries =
    (data.messages as unknown[] | undefined) ??
    (Array.isArray(payload) ? (payload as unknown[]) : []);
  if (entries.length === 0) return false;

  let skippedToolResult = false;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as Record<string, unknown>;
    if (e.role === "assistant") {
      const sr = e.stopReason as string | undefined;
      if (!sr) return true;
      if (sr === "toolUse" && skippedToolResult) return false;
      return sr !== "stop" && sr !== "error" && sr !== "aborted";
    }
    if (e.role === "user") return true;
    if (e.role === "toolResult") {
      skippedToolResult = true;
      continue;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const API_KEY_ERROR_PATTERNS = [
  "authentication_error",
  "invalid x-api-key",
  "invalid_api_key",
];
const PROVIDER_MISMATCH_PATTERNS = ["no api key found for provider"];
const RATE_LIMIT_ERROR_PATTERNS = [
  "rate_limit",
  "rate limit",
  "overloaded",
  "too many requests",
  "429",
  "529",
  "quota",
  "capacity",
];

export function classifyError(errorMessage: string): ErrorType {
  const lower = errorMessage.toLowerCase();
  if (API_KEY_ERROR_PATTERNS.some((p) => lower.includes(p))) return "apiKey";
  if (PROVIDER_MISMATCH_PATTERNS.some((p) => lower.includes(p)))
    return "providerMismatch";
  if (RATE_LIMIT_ERROR_PATTERNS.some((p) => lower.includes(p))) return "rateLimit";
  return "generic";
}

export function formatErrorMessage(
  errorMessage: string,
  errorType: ErrorType,
  model?: string,
): string {
  if (errorType === "apiKey") return "Your API key is invalid or expired.";
  if (errorType === "providerMismatch") {
    return "This model needs a provider prefix to work with your API key. Try switching with /model — for example: /model openrouter/google/gemini-2.5-pro";
  }
  if (errorType === "rateLimit") {
    return "We've hit a usage limit for this model. Try again in a moment or switch to a different model.";
  }
  try {
    const jsonStart = errorMessage.indexOf("{");
    if (jsonStart >= 0) {
      const parsed = JSON.parse(errorMessage.slice(jsonStart));
      const msg = parsed?.error?.message || parsed?.message;
      if (msg) return msg;
    }
  } catch {
    // Fall through.
  }
  const modelHint = model ? ` (model: ${model})` : "";
  return `${errorMessage || "Something went wrong."}${modelHint} Try again, switch model with /model, or start a new session with /new.`;
}

// ---------------------------------------------------------------------------
// Approval parsing
// ---------------------------------------------------------------------------

/**
 * Parse an exec tool result for approval info. Returns null if the result
 * isn't an approval-required message.
 *
 * The regex is CANONICAL for OpenClaw's exec-approval flow — `exec.approval.requested`
 * broadcasts don't carry `toolCallId` (verified by reading the upstream bundle),
 * so we have to recover that linkage by inspecting the tool result text. Don't
 * "modernize" this away.
 *
 * Plugin approvals use the native `req.toolCallId` from `plugin.approval.requested`
 * events and don't go through this function.
 */
export function parseApprovalFromToolResult(
  toolResult: string,
  toolCallId?: string,
): PendingApproval | null {
  const idMatch = toolResult.match(
    /Approval required \(id ([a-f0-9]+), full ([a-f0-9-]+)\)/,
  );
  if (!idMatch) return null;
  const approvalId = idMatch[2];
  const cmdMatch = toolResult.match(/```sh\n([\s\S]*?)\n```/);
  const command = cmdMatch?.[1] || "unknown command";
  const cwdMatch = toolResult.match(/CWD:\s*(.+)/);
  const hostMatch = toolResult.match(/Host:\s*(.+)/);
  return {
    approvalId,
    kind: "exec",
    command,
    cwd: cwdMatch?.[1],
    host: hostMatch?.[1],
    status: "pending",
    timestamp: Date.now(),
    toolCallId,
  };
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

export const SLASH_COMMANDS = [
  { name: "/new", description: "Start a fresh session", autoSend: true },
  { name: "/stop", description: "Stop the current run", autoSend: true },
  { name: "/model", description: "Switch AI model", autoSend: false },
  { name: "/help", description: "Show available commands", autoSend: true },
  { name: "/status", description: "Show agent status", autoSend: true },
  { name: "/compact", description: "Compact context window", autoSend: false },
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number];
