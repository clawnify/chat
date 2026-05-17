import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GatewayEvent, GatewayWs } from "@/lib/gateway-ws";
import {
  extractMessageText,
  parseApprovalFromToolResult,
  parseHistory,
  type Message,
  type PendingApproval,
  type SlashCommand,
} from "@/lib/protocol";
import { cn } from "@/lib/utils";
import { ActionGroup } from "@/components/ActionGroup";
import { ApprovalCard } from "@/components/ApprovalCard";
import { AssistantMessage } from "@/components/AssistantMessage";
import { FileActionPills } from "@/components/FileActionPills";
import { SlashMenu, filterCommands } from "@/components/SlashMenu";
import { isFileAction } from "@/lib/actions";
import { ArrowUp, Paperclip, Sparkles, Square } from "lucide-react";

export function Chat({
  gw,
  sessionKey,
}: {
  gw: GatewayWs;
  sessionKey: string;
}) {
  const SESSION_KEY = sessionKey;
  const [modelName, setModelName] = useState<string>("");
  const [thinkingLevel, setThinkingLevel] = useState<string>("medium");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [input, setInput] = useState("");
  const [slashIdx, setSlashIdx] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live streaming text from `chat` event deltas — separate from the
  // committed `messages` list. Upstream calls this `chatStream`. Each delta
  // replaces it (deltas carry cumulative text, not increments).
  const [chatStream, setChatStream] = useState<string>("");
  const listRef = useRef<HTMLDivElement>(null);
  const currentRunIdRef = useRef<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const payload = await gw.request("chat.history", {
        sessionKey: SESSION_KEY,
        limit: 100,
      });
      const parsed = parseHistory(payload);
      setMessages(parsed);

      setPendingApprovals((prev) => {
        const existing = new Set(prev.map((a) => a.approvalId));
        const fromHistory: PendingApproval[] = [];
        for (const msg of parsed) {
          if (msg.toolName === "exec" && msg.toolResult) {
            const p = parseApprovalFromToolResult(msg.toolResult, msg.toolCallId);
            if (p && !existing.has(p.approvalId)) fromHistory.push(p);
          }
        }
        return fromHistory.length === 0 ? prev : [...prev, ...fromHistory];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [gw, SESSION_KEY]);

  const resolveApproval = useCallback(
    async (approvalId: string, decision: "allow-once" | "allow-always" | "deny") => {
      const method = approvalId.startsWith("plugin:")
        ? "plugin.approval.resolve"
        : "exec.approval.resolve";
      try {
        await gw.request(method, { id: approvalId, decision });
        setPendingApprovals((prev) =>
          prev.map((a) =>
            a.approvalId === approvalId ? { ...a, status: decision } : a,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [gw],
  );

  // Fetch the agent's current model/thinking for the status bar.
  useEffect(() => {
    let cancelled = false;
    gw.request<AgentsListResponse>("agents.list", {})
      .then((res) => {
        if (cancelled) return;
        const agent = res?.agents?.find((a) => SESSION_KEY.includes(a.id ?? "")) ?? res?.agents?.[0];
        const primary = agent?.model?.primary;
        if (primary) setModelName(primary);
        const thinking = agent?.thinking;
        if (typeof thinking === "string") setThinkingLevel(thinking);
      })
      .catch(() => {
        // best effort; status bar just shows "—" when unknown
      });
    return () => {
      cancelled = true;
    };
  }, [gw, SESSION_KEY]);

  // Reset local state when the active session changes — otherwise the
  // previous session's transcript and live stream leak into the new tab.
  useEffect(() => {
    setMessages([]);
    setPendingApprovals([]);
    setChatStream("");
    setError(null);
    currentRunIdRef.current = null;
    setSending(false);
  }, [SESSION_KEY]);

  useEffect(() => {
    let cancelled = false;
    fetchHistory();

    const handler = (evt: GatewayEvent) => {
      if (cancelled) return;
      const p = evt.payload as Record<string, unknown> | undefined;

      if (evt.event === "exec.approval.requested" && p) {
        const req = p.request as Record<string, unknown> | undefined;
        const approvalId = (p.id as string) || (p.approvalId as string);
        if (!approvalId) return;
        setPendingApprovals((prev) =>
          prev.some((a) => a.approvalId === approvalId)
            ? prev
            : [
                ...prev,
                {
                  approvalId,
                  kind: "exec",
                  command:
                    (req?.command as string) ||
                    (p.command as string) ||
                    "unknown command",
                  cwd: (req?.cwd as string) || (p.cwd as string | undefined),
                  agentId:
                    (req?.agentId as string) || (p.agentId as string | undefined),
                  host: (req?.host as string) || (p.host as string | undefined),
                  status: "pending",
                  timestamp: (p.createdAtMs as number) || Date.now(),
                  expiresAt: p.expiresAtMs as number | undefined,
                },
              ],
        );
        return;
      }

      if (evt.event === "plugin.approval.requested" && p) {
        const req = p.request as Record<string, unknown> | undefined;
        const approvalId = (p.id as string) || (p.approvalId as string);
        if (!approvalId) return;
        setPendingApprovals((prev) =>
          prev.some((a) => a.approvalId === approvalId)
            ? prev
            : [
                ...prev,
                {
                  approvalId,
                  kind: "plugin",
                  title: req?.title as string | undefined,
                  description: req?.description as string | undefined,
                  toolName: req?.toolName as string | undefined,
                  pluginId: req?.pluginId as string | undefined,
                  toolCallId: req?.toolCallId as string | undefined,
                  status: "pending",
                  timestamp: (p.createdAtMs as number) || Date.now(),
                  expiresAt: p.expiresAtMs as number | undefined,
                },
              ],
        );
        return;
      }

      if (
        (evt.event === "exec.approval.resolved" ||
          evt.event === "plugin.approval.resolved") &&
        p
      ) {
        const approvalId = (p.approvalId as string) || (p.id as string);
        const decision = p.decision as string;
        if (approvalId && decision) {
          setPendingApprovals((prev) =>
            prev.map((a) =>
              a.approvalId === approvalId ? { ...a, status: decision } : a,
            ),
          );
        }
        return;
      }

      if (evt.event === "chat") {
        applyChatEvent(evt.payload as ChatEventPayload | undefined);
      }
    };

    gw.onEvent(handler);
    return () => {
      cancelled = true;
      gw.onEvent(null);
    };
  }, [gw, fetchHistory]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, chatStream]);

  /**
   * Canonical chat-event handler. Matches `handleChatEvent` in upstream
   * `ui/src/ui/controllers/chat.ts`:
   *
   *   { state: "delta",    message, runId?, sessionKey } → live streaming text
   *   { state: "final",    message, runId,  sessionKey } → commit final assistant turn
   *   { state: "aborted",  message, runId,  sessionKey } → commit partial assistant turn
   *   { state: "error",    errorMessage,    sessionKey } → surface error
   *
   * Only events for our session OR our active runId are applied.
   */
  function applyChatEvent(payload: ChatEventPayload | undefined) {
    if (!payload) return;
    const sessionMatches = payload.sessionKey === SESSION_KEY;
    const activeRunMatches =
      currentRunIdRef.current != null && payload.runId === currentRunIdRef.current;
    if (!sessionMatches && !activeRunMatches) return;

    if (payload.state === "delta") {
      const next = extractMessageText(payload.message);
      if (typeof next === "string") setChatStream(next);
      return;
    }

    if (payload.state === "final") {
      // Refetch to get the authoritative version (with tool calls, thinking,
      // etc.) — the in-event message is just the visible text. Clearing the
      // stream first so we don't double-render during the refetch window.
      setChatStream("");
      currentRunIdRef.current = null;
      setSending(false);
      fetchHistory();
      return;
    }

    if (payload.state === "aborted") {
      // Keep whatever partial text was streamed; refetch for the canonical
      // tail (gateway persists aborted partials per docs).
      setChatStream("");
      currentRunIdRef.current = null;
      setSending(false);
      fetchHistory();
      return;
    }

    if (payload.state === "error") {
      setError(payload.errorMessage ?? "chat error");
      setChatStream("");
      currentRunIdRef.current = null;
      setSending(false);
      return;
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    if (text === "/stop") {
      setInput("");
      return abort();
    }

    setInput("");
    setSending(true);
    setError(null);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, optimistic: true },
    ]);

    const runId = crypto.randomUUID();
    currentRunIdRef.current = runId;
    try {
      await gw.request("chat.send", {
        sessionKey: SESSION_KEY,
        message: text,
        idempotencyKey: runId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSending(false);
    }
  }

  function completeSlash(cmd: SlashCommand) {
    if (cmd.autoSend) {
      setInput("");
      if (cmd.name === "/stop") return abort();
      const runId = crypto.randomUUID();
      currentRunIdRef.current = runId;
      gw.request("chat.send", {
        sessionKey: SESSION_KEY,
        message: cmd.name,
        idempotencyKey: runId,
      }).catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    } else {
      setInput(cmd.name + " ");
    }
    setSlashIdx(0);
  }

  /**
   * Send chat.abort and let the cleanup happen when the resulting
   * `state: "aborted"` event arrives. Don't clear local stream/run state
   * here — the canonical upstream `abortChatRun` doesn't either, and
   * clearing optimistically would cause the gateway's reply to be dropped
   * by the `sessionMatches || activeRunMatches` filter.
   */
  async function abort() {
    const runId = currentRunIdRef.current;
    try {
      await gw.request("chat.abort", {
        sessionKey: SESSION_KEY,
        ...(runId ? { runId } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const slashCandidates = filterCommands(input);
    const slashOpen = input.startsWith("/") && slashCandidates.length > 0;

    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => Math.min(i + 1, slashCandidates.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const cmd = slashCandidates[slashIdx];
        if (cmd) completeSlash(cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const renderItems = useMemo(() => groupForRender(messages), [messages]);
  const [composerFocused, setComposerFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  const isRunning = sending;
  const hasContent = input.trim().length > 0;

  return (
    <main className="flex-1 flex flex-col min-h-0">
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-3 max-w-3xl w-full mx-auto"
      >
        {messages.length === 0 && !sending && (
          <div className="m-auto text-sm text-muted-foreground">
            No messages yet. Say hi.
          </div>
        )}
        {renderItems.map((item, i) => {
          if (item.kind === "msg") return <MessageRow key={i} msg={item.msg} />;
          // If every action is a file op (read / write / edit / multiedit),
          // render filename pills — otherwise fall back to the collapsible
          // count group used for exec / browser / etc.
          if (item.actions.every((a) => isFileAction(a.toolName))) {
            return <FileActionPills key={i} actions={item.actions} />;
          }
          return (
            <ActionGroup
              key={i}
              actions={item.actions}
              anyPending={item.actions.some((a) => !a.toolResult)}
            />
          );
        })}
        {chatStream && (
          <MessageRow
            msg={{
              role: "assistant",
              content: chatStream,
              streaming: true,
            }}
          />
        )}
      </div>

      {pendingApprovals.length > 0 && (
        <div className="bg-muted/30 px-6 py-3 flex flex-col gap-2.5 max-h-[50vh] overflow-y-auto max-w-3xl w-full mx-auto">
          {pendingApprovals.map((a) => (
            <ApprovalCard
              key={a.approvalId}
              approval={a}
              onResolve={resolveApproval}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="px-6 py-2 text-xs text-destructive max-w-3xl w-full mx-auto">
          {error}
        </div>
      )}

      {/* Composer — markup ported from apps/web chat-panel.tsx (Clawnify dashboard).
          Outer gray container (`bg-muted/40`) wraps the white inner box + status bar
          like the dashboard does. */}
      <div className="px-4 pb-4 max-w-2xl w-full mx-auto">
        <div className="relative rounded-2xl border border-border/60 bg-muted/40 p-2">
          <SlashMenu
            filter={input}
            selectedIdx={slashIdx}
            onSelect={completeSlash}
          />
          <div
            className={cn(
              "overflow-hidden rounded-xl bg-background shadow-sm ring-1 ring-border/50 transition-all",
              composerFocused && "ring-border shadow-md",
            )}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.currentTarget.value);
                setSlashIdx(0);
              }}
              onInput={autoResize}
              onKeyDown={onKeyDown}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              placeholder="Message the agent…"
              rows={1}
              disabled={sending}
              className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm outline-none placeholder:text-muted-foreground/70 disabled:opacity-50"
              style={{ maxHeight: "200px", minHeight: "44px" }}
            />
            <div className="flex items-center justify-between px-2.5 pb-2.5">
              <button
                type="button"
                disabled
                title="Attachments (coming soon)"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/40 cursor-not-allowed"
              >
                <Paperclip size={18} />
              </button>
              <div className="flex items-center gap-1.5">
                {isRunning ? (
                  <button
                    type="button"
                    onClick={abort}
                    title="Stop"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/80 text-white hover:bg-red-600 transition-colors"
                  >
                    <Square size={12} strokeWidth={2.5} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={send}
                    disabled={!hasContent}
                    title="Send"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                      hasContent
                        ? "bg-foreground text-background hover:bg-foreground/90"
                        : "bg-muted/60 text-muted-foreground/40 cursor-default",
                    )}
                  >
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* Status bar inside the gray outer container, below the white box.
              Replaces the dashboard's Auto Router pill with the agent's
              current model name. */}
          <div className="flex items-center justify-between gap-4 px-2.5 pt-2 pb-1 text-[11px] text-muted-foreground/70">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1">
                <kbd className="font-mono">/</kbd> commands
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles size={11} />
                thinking: {thinkingLevel}
              </span>
              {modelName && (
                <span className="inline-flex items-center gap-1 font-mono truncate max-w-[40ch]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                  {modelName}
                </span>
              )}
            </div>
            <span className="hidden sm:inline">
              <kbd className="font-mono">Enter</kbd> send ·{" "}
              <kbd className="font-mono">Shift+Enter</kbd> new line
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

interface AgentsListResponse {
  agents?: {
    id?: string;
    model?: { primary?: string };
    thinking?: string;
  }[];
}

type RenderItem =
  | { kind: "msg"; msg: Message }
  | { kind: "actions"; actions: Message[] };

function groupForRender(messages: Message[]): RenderItem[] {
  const items: RenderItem[] = [];
  let buf: Message[] = [];
  for (const m of messages) {
    if (m.role === "action") {
      buf.push(m);
      continue;
    }
    if (buf.length) {
      items.push({ kind: "actions", actions: buf });
      buf = [];
    }
    items.push({ kind: "msg", msg: m });
  }
  if (buf.length) items.push({ kind: "actions", actions: buf });
  return items;
}

function MessageRow({ msg }: { msg: Message }) {
  if (msg.role === "system") {
    return (
      <div className="self-start max-w-[85%] bg-muted/50 italic rounded-lg px-3 py-2 text-sm text-muted-foreground">
        {msg.content}
      </div>
    );
  }

  // Thinking-only assistant entries — emit the dashed Thought pill alone,
  // no bubble, no role label. Empties out cleanly when the loop is just
  // thinking → tool-call → thinking → tool-call without text between.
  if (msg.role === "assistant" && !msg.content && msg.thinking) {
    return (
      <div className="self-start max-w-[85%]">
        <AssistantMessage content="" thinking={msg.thinking} />
      </div>
    );
  }

  const isUser = msg.role === "user";
  return (
    <div
      className={cn(
        "text-sm",
        isUser
          ? "self-end max-w-[80%] bg-muted rounded-2xl px-4 py-2 text-foreground"
          : "self-start max-w-full w-full bg-transparent text-foreground",
        msg.optimistic && "opacity-60",
        msg.errorType &&
          "border border-destructive text-destructive bg-destructive/5 rounded-2xl px-4 py-2",
      )}
    >
      {msg.role === "assistant" ? (
        <AssistantMessage
          content={msg.content}
          thinking={msg.thinking}
          streaming={msg.streaming}
        />
      ) : (
        <div className="whitespace-pre-wrap break-words">
          {msg.content || (msg.streaming ? "…" : "")}
        </div>
      )}
    </div>
  );
}

interface ChatEventPayload {
  state: "delta" | "final" | "aborted" | "error";
  sessionKey: string;
  runId?: string;
  message?: unknown;
  errorMessage?: string;
}
