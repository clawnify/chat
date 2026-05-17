import { useEffect, useRef, useState } from "react";
import type { GatewayEvent, GatewayWs } from "../lib/gateway-ws";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  pending?: boolean;
}

/**
 * Minimal v0 chat surface. Speaks gateway v4:
 *   - chat.history       : initial transcript fetch
 *   - chat.send          : send a user message (acks; reply streams via events)
 *   - chat.abort         : stop the current run
 *   - chat events        : streaming assistant chunks + run lifecycle
 *
 * Tool-event cards, approval UI, session/model switching, and the rich
 * content renderer are intentionally NOT in this slice — they come in the
 * protocol-core port that follows this scaffold.
 */
export function Chat({ gw }: { gw: GatewayWs }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const streamingIdRef = useRef<string | null>(null);

  // Load history + subscribe to events.
  useEffect(() => {
    let cancelled = false;

    gw.request<{ entries?: HistoryEntry[] }>("chat.history", { limit: 100 })
      .then((res) => {
        if (cancelled) return;
        const parsed = parseHistory(res.entries ?? []);
        setMessages(parsed);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    const handler = (evt: GatewayEvent) => {
      if (cancelled) return;
      if (evt.event === "chat") {
        const payload = evt.payload as ChatEventPayload | undefined;
        if (!payload) return;
        applyChatEvent(payload);
      }
    };

    gw.onEvent(handler);
    return () => {
      cancelled = true;
      gw.onEvent(null);
    };
  }, [gw]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function applyChatEvent(payload: ChatEventPayload) {
    // Streaming assistant text — append to the in-flight assistant bubble.
    if (payload.kind === "delta" && typeof payload.text === "string") {
      setMessages((prev) => {
        const id = streamingIdRef.current;
        if (!id) {
          const newId = makeId();
          streamingIdRef.current = newId;
          return [
            ...prev,
            { id: newId, role: "assistant", text: payload.text!, pending: true },
          ];
        }
        return prev.map((m) =>
          m.id === id ? { ...m, text: (m.text ?? "") + payload.text! } : m,
        );
      });
      return;
    }
    // Run finished — finalize the bubble.
    if (payload.kind === "end" || payload.kind === "complete") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingIdRef.current ? { ...m, pending: false } : m,
        ),
      );
      streamingIdRef.current = null;
      setSending(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setSending(true);
    setError(null);

    const userMsg: ChatMessage = { id: makeId(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      await gw.request("chat.send", {
        text,
        idempotencyKey: userMsg.id,
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
      streamingIdRef.current = null;
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
        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            <div className="msg-role">{m.role}</div>
            <div className="msg-text">{m.text}</div>
          </div>
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

// --- minimal history parser ---------------------------------------------------
// chat-panel.tsx's parseHistory does ~400 lines of work (tool calls, action
// groups, abort partials, etc.). This v0 keeps only the basics; the rich
// parser comes in the protocol-core port follow-up.

interface HistoryEntry {
  id?: string;
  role?: string;
  text?: string;
  content?: string;
}

interface ChatEventPayload {
  kind?: string;
  text?: string;
  runId?: string;
}

function parseHistory(entries: HistoryEntry[]): ChatMessage[] {
  return entries
    .map((e, i): ChatMessage | null => {
      const role = e.role === "user" || e.role === "assistant" || e.role === "system" ? e.role : null;
      if (!role) return null;
      const text = e.text ?? e.content ?? "";
      if (!text.trim()) return null;
      return { id: e.id ?? `hist-${i}`, role, text };
    })
    .filter((m): m is ChatMessage => m !== null);
}

function makeId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
