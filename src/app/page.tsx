"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [url, setUrl] = useState("");
  type AuditMessage = {
    message?: string;
    status?: string;
    summary?: unknown;
    imagesWithoutAlt?: number;
    [key: string]: unknown;
  };
  const [messages, setMessages] = useState<AuditMessage[]>([]);

  async function start() {
    setMessages([]);
    const res = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const { auditId } = await res.json();
    const es = new EventSource(`/api/audit/${auditId}`);
    es.onmessage = (ev) => {
      const data: AuditMessage = JSON.parse(ev.data);
      setMessages((m) => [...m, data]);
      if (data.status === "done" || data.status === "error") {
        es.close();
      }
    };
  }

  return (
    <main className="flex flex-col max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex space-x-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="flex-1 border rounded px-3 py-2"
        />
        <Button onClick={start}>Audit</Button>
      </div>
      <div className="flex flex-col space-y-2">
        {messages.map((m, i) => (
          <div key={i} className="p-2 rounded border ">
            <pre>{JSON.stringify(m)}</pre>
          </div>
        ))}
      </div>
    </main>
  );
}
