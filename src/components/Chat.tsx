import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GatewayEvent, GatewayWs } from "@/lib/gateway-ws";
import {
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
import { SlashMenu, filterCommands } from "@/components/SlashMenu";

export function Chat({ gw }: { gw: GatewayWs }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [input, setInput] = useState("");
  const [slashIdx, setSlashIdx] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const streamingIdxRef = useRef<number | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const payload = await gw.request("chat.history", { limit: 100 });
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
  }, [gw]);

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
  }, [messages]);

  function applyChatEvent(payload: ChatEventPayload | undefined) {
    if (!payload) return;

    if (payload.kind === "delta" && typeof payload.text === "string") {
      setMessages((prev) => {
        const idx = streamingIdxRef.current;
        if (idx == null || !prev[idx] || prev[idx].role !== "assistant") {
          const next = [
            ...prev,
            {
              role: "assistant" as const,
              content: payload.text!,
              streaming: true,
            },
          ];
          streamingIdxRef.current = next.length - 1;
          return next;
        }
        const next = prev.slice();
        next[idx] = { ...next[idx], content: next[idx].content + payload.text! };
        return next;
      });
      return;
    }

    if (payload.kind === "end" || payload.kind === "complete") {
      streamingIdxRef.current = null;
      setSending(false);
      fetchHistory();
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

    try {
      await gw.request("chat.send", {
        text,
        idempotencyKey: `clw-${Date.now()}`,
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
      gw.request("chat.send", {
        text: cmd.name,
        idempotencyKey: `clw-${Date.now()}`,
      }).catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    } else {
      setInput(cmd.name + " ");
    }
    setSlashIdx(0);
  }

  async function abort() {
    try {
      await gw.request("chat.abort", {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
      streamingIdxRef.current = null;
      fetchHistory();
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

  return (
    <main className="flex-1 flex flex-col min-h-0">
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3"
      >
        {messages.length === 0 && !sending && (
          <div className="m-auto text-sm text-muted-foreground">
            No messages yet. Say hi.
          </div>
        )}
        {renderItems.map((item, i) =>
          item.kind === "msg" ? (
            <MessageRow key={i} msg={item.msg} />
          ) : (
            <ActionGroup
              key={i}
              actions={item.actions}
              anyPending={item.actions.some((a) => !a.toolResult)}
            />
          ),
        )}
      </div>

      {pendingApprovals.length > 0 && (
        <div className="border-t bg-muted/30 px-5 py-3 flex flex-col gap-2.5 max-h-[50vh] overflow-y-auto">
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
        <div className="border-t bg-muted/30 px-5 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="border-t px-5 py-3 flex flex-col gap-2">
        <div className="relative w-full">
          <SlashMenu filter={input} selectedIdx={slashIdx} onSelect={completeSlash} />
        </div>
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.currentTarget.value);
            setSlashIdx(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Message the agent… (try /help)"
          rows={3}
          disabled={sending}
          className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground disabled:opacity-50"
        />
        <div className="flex justify-end">
          {sending ? (
            <button
              type="button"
              onClick={abort}
              className="px-3 py-1.5 rounded-md text-sm border bg-background text-destructive hover:bg-muted transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!input.trim()}
              className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </main>
  );
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
      <div className="self-start max-w-[80%]">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          system
        </div>
        <div className="bg-muted/50 italic rounded-lg px-3 py-2 text-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  const isUser = msg.role === "user";
  return (
    <div
      className={cn(
        "flex flex-col gap-1 max-w-[80%]",
        isUser ? "self-end items-end" : "self-start items-start",
        msg.optimistic && "opacity-60",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {msg.role}
      </div>
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border",
          msg.errorType && "border-destructive text-destructive bg-destructive/5",
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
    </div>
  );
}

interface ChatEventPayload {
  kind?: string;
  text?: string;
  runId?: string;
}
