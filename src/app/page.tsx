"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock, Globe, Loader2, Trash2, ArrowRight, RefreshCw, Rocket } from "lucide-react";
import Link from "next/link";

type ChatItem = {
  id: string;
  role: "user" | "assistant" | "system";
  type: "text" | "status" | "result" | "error";
  content: string;
  payload?: Record<string, unknown>;
  ts: number;
};

type RecentAudit = { id: string; url: string; ts: number };

export default function Home() {
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [recent, setRecent] = useState<RecentAudit[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("recentAudits");
    if (saved) setRecent(JSON.parse(saved));
  }, []);

  useEffect(() => {
    // auto-scroll to newest
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);

  function saveRecent(a: RecentAudit) {
    const next = [a, ...recent.filter((r) => r.id !== a.id)].slice(0, 20);
    setRecent(next);
    localStorage.setItem("recentAudits", JSON.stringify(next));
  }

  async function startAudit(raw: string) {
    const url = raw.trim();
    if (!url) return;
    setIsRunning(true);
    const finished = { current: false };
    const userMsg: ChatItem = {
      id: crypto.randomUUID(),
      role: "user",
      type: "text",
      content: url,
      ts: Date.now(),
    };
    setChat((c) => [...c, userMsg, typingStatus("Starting audit…")]);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const { auditId } = await res.json();
      saveRecent({ id: auditId, url, ts: Date.now() });

      const es = new EventSource(`/api/audit/${auditId}`);
      es.onopen = () => {
        // Clear any temporary reconnect notices
        setChat((c) => c);
      };
      es.onmessage = (ev) => {
        const data = JSON.parse(ev.data) as Record<string, any>;
        if (data.message || data.step) {
          setChat((c) => replaceLastTyping(c, {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "status",
            content: data.message || data.step,
            ts: Date.now(),
          }, true));
          // add a new typing effect after each update
          setChat((c) => [...c, typingStatus(nextTypingText(data.step))]);
        }
        if (data.status === "error") {
          finished.current = true;
          es.close();
          setIsRunning(false);
          setChat((c) => replaceLastTyping(c, {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "error",
            content: String(data.message || "Unexpected error"),
            ts: Date.now(),
          }));
        }
        if (data.status === "done") {
          finished.current = true;
          es.close();
          setIsRunning(false);
          setChat((c) => replaceLastTyping(c, buildResultMessage(url, data, auditId)));
        }
      };
      es.onerror = () => {
        if (finished.current) return; // ignore error after graceful close
        // Let EventSource auto-reconnect; show a subtle status
        setChat((c) => replaceLastTyping(c, {
          id: crypto.randomUUID(),
          role: "assistant",
          type: "status",
          content: "Connection interrupted, attempting to reconnect…",
          ts: Date.now(),
        }));
      };
    } catch (e) {
      setIsRunning(false);
      setChat((c) => replaceLastTyping(c, {
        id: crypto.randomUUID(),
        role: "assistant",
        type: "error",
        content: String(e),
        ts: Date.now(),
      }));
    }
  }

  const placeholder = useMemo(
    () => "Enter a website URL (e.g., https://example.com) or a command",
    []
  );

  return (
    <div className="h-screen w-full text-foreground flex">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-80 bg-card/80 backdrop-blur-sm shadow-md">
        <div className="p-4 sticky top-0 bg-card/80 backdrop-blur-sm z-10 shadow-sm">
          <div className="flex items-center gap-2 font-semibold">
            <Globe className="h-5 w-5 text-primary" />
            <span>WP Audit Chat</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {recent.length === 0 && (
            <p className="text-sm text-muted-foreground px-2">No previous audits yet.</p>
          )}
          {recent.map((r) => (
            <div
              key={r.id}
              className="w-full rounded-md p-3 hover:bg-muted transition flex items-center gap-2 justify-between"
              title={r.url}
            >
              <Link href={`/summary/${r.id}`} className="flex items-center gap-2 min-w-0 flex-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="truncate">
                  <div className="text-sm font-medium truncate">{r.url}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.ts).toLocaleString()}
                  </div>
                </div>
              </Link>
              <Button
                variant="outline"
                size="sm"
                title="Re-run audit"
                onClick={(e) => {
                  e.preventDefault();
                  startAudit(r.url);
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        {recent.length > 0 && (
          <div className="p-3">
            <Button
              variant="destructiveOutline"
              className="w-full"
              onClick={() => {
                localStorage.removeItem("recentAudits");
                setRecent([]);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Clear history
            </Button>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        {/* Chat stream */}
        <div ref={streamRef} className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-2xl mx-auto space-y-4">
            {chat.map((m) => (
              <ChatBubble key={m.id} item={m} />
            ))}
            {!chat.length && (
              <div className="text-center text-muted-foreground mt-24">
                <p className="text-lg font-medium">Start a new audit</p>
                <p className="text-sm">Paste a site URL below to begin.</p>
              </div>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-sm">
          <div className="max-w-3xl mx-auto p-3 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") startAudit(input);
              }}
              placeholder={placeholder}
              className="flex-1 px-4 py-3 rounded-md bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              onClick={() => startAudit(input)}
              disabled={isRunning || !input.trim()}
              variant="gradient"
              size="lg"
            >
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Rocket className="h-4 w-4" /> Audit
                </span>
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function typingStatus(text: string): ChatItem {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    type: "status",
    content: text,
    ts: Date.now(),
  };
}

function replaceLastTyping(
  items: ChatItem[],
  replacement: ChatItem,
  keepReplacementOnly: boolean = false
) {
  const idx = [...items].reverse().findIndex((m) => m.type === "status");
  if (idx === -1) return [...items, replacement];
  const realIdx = items.length - 1 - idx;
  const head = items.slice(0, realIdx);
  return keepReplacementOnly ? [...head, replacement] : [...head, replacement];
}

function nextTypingText(step?: string) {
  const base = step ? `Working: ${step}` : "Analyzing…";
  return base;
}

function buildResultMessage(url: string, data: Record<string, any>, id?: string): ChatItem {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    type: "result",
    content: `Audit complete for ${url}`,
    payload: { ...data, id },
    ts: Date.now(),
  };
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent text-accent-foreground px-2 py-1 text-xs font-medium">
      {children}
    </span>
  );
}

function ChatBubble({ item }: { item: ChatItem }) {
  const isUser = item.role === "user";
  const base = "animate-in fade-in slide-in-from-bottom-2";
  if (item.type === "result") {
    const p = item.payload || {};
    const chips = [
      p.title ? `title: ${(p.title as string).slice(0, 60)}` : null,
      p.imagesWithoutAlt != null ? `${p.imagesWithoutAlt} images without alt` : null,
      p.brokenLinkCount != null ? `${p.brokenLinkCount} broken links` : null,
      Array.isArray(p.missingSecurityHeaders)
        ? `${(p.missingSecurityHeaders as any[]).length} missing security headers`
        : null,
      p.accessibilityViolationCount != null
        ? `${p.accessibilityViolationCount} a11y violations`
        : null,
    ].filter(Boolean) as string[];
    return (
      <div className={`${base} flex gap-3`}>
        <div className="flex-1">
          <div className="rounded-lg bg-card p-4 shadow-sm">
            <div className="text-sm text-neutral-500 mb-1">Assistant</div>
            <div className="font-medium mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {item.content}
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {chips.map((c, i) => (
                <Chip key={i}>{c}</Chip>
              ))}
            </div>
            {p.id ? (
              <Link
                href={`/summary/${p.id}`}
                className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/90"
              >
                View Summary <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <pre className="mt-2 max-h-72 overflow-auto text-xs bg-muted p-2 rounded">
                {JSON.stringify(item.payload, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (item.type === "status") {
    return (
      <div className={`${base} flex gap-3`}>
        <div className="flex-1">
          <div className="rounded-lg bg-card p-3 text-sm text-foreground flex items-center gap-2 shadow-sm">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
            <span className="animate-pulse">{item.content}</span>
          </div>
        </div>
      </div>
    );
  }
  if (item.type === "error") {
    return (
      <div className={`${base} flex gap-3`}>
        <div className="flex-1">
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive shadow-sm">
            {item.content}
          </div>
        </div>
      </div>
    );
  }
  // user text
  return (
    <div className={`${base} flex justify-end`}>
      <div className="max-w-[80%] rounded-lg bg-primary text-primary-foreground px-4 py-2 shadow">
        {item.content}
      </div>
    </div>
  );
}
