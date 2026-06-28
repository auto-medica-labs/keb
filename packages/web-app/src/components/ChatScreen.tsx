import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import MarkdownIt from "markdown-it";
import type { BridgeClient, BridgeEvent, ConnectionStatus, QueryCallbacks } from "../lib/ws";

const md = new MarkdownIt({ breaks: true, linkify: true, typographer: true });

// ── Types ────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  text: string;
}

type ToolEntry = { text: string; cls: string };

interface ChatScreenProps {
  client: BridgeClient;
  connectionStatus: ConnectionStatus;
  username?: string;
  onDisconnect: () => void;
  onSettings: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

function MarkdownBlock({ text }: { text: string }) {
  const html = useMemo(() => md.render(text), [text]);
  return (
    <div
      className="markdown-content text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── Component ────────────────────────────────────────────────────

export default function ChatScreen({
  client,
  connectionStatus,
  username,
  onDisconnect,
  onSettings,
}: ChatScreenProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [inProgress, setInProgress] = useState(false);
  const [streamText, setStreamText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when content changes
  const scrollKey = useMemo(
    () => messages.map((m) => m.text).join("") + streamText + tools.length,
    [messages, streamText, tools],
  );
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scrollKey]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || !client.connected || inProgress) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setTools([]);
    setStreamText("");
    setInProgress(true);

    const callbacks: QueryCallbacks = {
      onEvent: (event: BridgeEvent) => {
        if (event.assistantMessageEvent?.type === "text_delta") {
          setStreamText((prev) => prev + (event.assistantMessageEvent?.delta || ""));
        }
        if (event.type === "tool_execution_start") {
          setTools((prev) => [
            ...prev,
            { text: `Running ${event.toolName || "tool"}...`, cls: "text-yellow-500" },
          ]);
        }
        if (event.type === "tool_execution_end") {
          setTools((prev) => [
            ...prev,
            { text: `Finished ${event.toolName || "tool"}`, cls: "text-green-500" },
          ]);
        }
      },
      onDone: () => {
        // Capture the final stream text
        setMessages((prev) => {
          const currentStream = streamTextRef.current;
          if (currentStream) {
            return [...prev, { role: "assistant", text: currentStream }];
          }
          return prev;
        });
        setStreamText("");
        setInProgress(false);
        setTools([]);
      },
      onError: (message: string) => {
        setTools((prev) => [...prev, { text: `Error: ${message}`, cls: "text-red-500" }]);
        setInProgress(false);
      },
    };

    client.query(text, callbacks);
  }, [input, client, inProgress]);

  // Ref to capture latest streamText in onDone closure
  const streamTextRef = useRef(streamText);
  streamTextRef.current = streamText;

  const connected = client.connected;
  const statusDot = connected ? "bg-green-500" : "bg-red-500";

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold">Keb Chat</h1>
          <span className={`inline-block size-2 rounded-full ${statusDot}`} />
          <span className="text-xs text-muted-foreground">
            {connectionStatus === "connected"
              ? "Connected"
              : connectionStatus === "connecting"
                ? "Connecting..."
                : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {username && (
            <span className="text-xs text-muted-foreground">{username}</span>
          )}
          <button
            onClick={onSettings}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Settings
          </button>
          <button
            onClick={onDisconnect}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !inProgress && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <p className="text-sm text-muted-foreground">
                Ask anything about your knowledge base.
              </p>
              {!connected && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Not connected. Check your settings.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.role === "assistant" ? (
                  <MarkdownBlock text={msg.text} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                )}
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {inProgress && streamText && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl bg-muted px-4 py-2">
                <MarkdownBlock text={streamText} />
              </div>
            </div>
          )}

          {/* Tool entries */}
          {tools.length > 0 && (
            <div className="space-y-1 ml-1">
              {tools.map((t, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 font-mono text-[11px] ${t.cls}`}
                >
                  <span className="shrink-0">
                    {t.cls.includes("green") ? "✓" : t.cls.includes("red") ? "✗" : "⚙"}
                  </span>
                  {t.text}
                </div>
              ))}
            </div>
          )}

          {/* Initial cursor */}
          {inProgress && !streamText && tools.length === 0 && (
            <div className="flex justify-start">
              <div className="rounded-xl bg-muted px-4 py-2">
                <span className="text-sm text-muted-foreground animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border px-4 py-3">
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ask your knowledge base..."
            disabled={!connected || inProgress}
            className="block h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={!connected || !input.trim() || inProgress}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {inProgress ? (
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              "Send"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
