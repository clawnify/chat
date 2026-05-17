import { useCallback, useEffect, useRef, useState } from "react";
import type { GatewayEvent, GatewayWs } from "../lib/gateway-ws";
import { parseHistory, type Message } from "../lib/protocol";
import { actionLabel } from "../lib/actions";

/**
 * Stage 1 of the rich port: history fetch + four-role rendering using the new
 * pure parser in src/lib/protocol.ts. Streaming behavior is still naive (delta
 * → append, end → refetch). Tool-event cards, approval cards, action grouping,
 * thinking display, and slash commands land in later stages.
 */
export function Chat({ gw }: { gw: GatewayWs }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const streamingIdxRef = useRef<number | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const payload = await gw.request("chat.history", { limit: 100 });
      setMessages(parseHistory(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [gw]);

  useEffect(() => {
    let cancelled = false;
    fetchHistory();

    const handler = (evt: GatewayEvent) => {
      if (cancelled) return;
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

    // Streaming assistant text — append to or create the in-flight bubble.
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

    // Run finished — refetch history so we get the authoritative final state
    // including action/toolResult correlation that streaming deltas don't carry.
    if (payload.kind === "end" || payload.kind === "complete") {
      streamingIdxRef.current = null;
      setSending(false);
      fetchHistory();
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setSending(true);
    setError(null);

    // Optimistic user bubble — replaced when history refetch completes.
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <main className="chat">
      <div className="messages" ref={listRef}>
        {messages.length === 0 && !sending && (
          <div className="messages-empty">No messages yet. Say hi.</div>
        )}
        {messages.map((m, i) => (
          <MessageRow key={i} msg={m} />
        ))}
      </div>

      {error && <div className="chat-error">{error}</div>}

      <div className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Message the agent…"
          rows={3}
          disabled={sending}
        />
        <div className="composer-actions">
          {sending ? (
            <button type="button" onClick={abort} className="abort">
              Stop
            </button>
          ) : (
            <button type="button" onClick={send} disabled={!input.trim()}>
              Send
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function MessageRow({ msg }: { msg: Message }) {
  if (msg.role === "action") {
    return (
      <div className="action">
        <span className="action-pill" title={msg.content}>
          <span className="action-icon">▸</span>
          <span className="action-text">
            {actionLabel(msg.toolName ?? "tool", msg.content)}
          </span>
          {msg.toolError && <span className="action-err">error</span>}
        </span>
      </div>
    );
  }
  if (msg.role === "system") {
    return (
      <div className="msg msg-system">
        <div className="msg-role">system</div>
        <div className="msg-text">{msg.content}</div>
      </div>
    );
  }
  const className = `msg msg-${msg.role}${msg.errorType ? " msg-error" : ""}${
    msg.optimistic ? " msg-optimistic" : ""
  }`;
  return (
    <div className={className}>
      <div className="msg-role">{msg.role}</div>
      <div className="msg-text">{msg.content || (msg.streaming ? "…" : "")}</div>
    </div>
  );
}

interface ChatEventPayload {
  kind?: string;
  text?: string;
  runId?: string;
}
