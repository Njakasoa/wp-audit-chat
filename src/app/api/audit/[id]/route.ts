import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEmitter } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const emitter = getEmitter(id);
  const audit = await prisma.audit.findUnique({ where: { id } });
  const stream = new ReadableStream({
    start(controller) {
      let ping: ReturnType<typeof setInterval> | null = null;
      const send = (data: unknown) => {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Send current status if known
      if (audit) {
        send({ status: audit.status, summary: audit.summary });
        // If already finished, we can close after initial snapshot
        if (audit.status === "done" || audit.status === "error") {
          controller.close();
          return;
        }
      }

      // Keep-alive pings to prevent idle timeouts
      ping = setInterval(() => {
        try {
          controller.enqueue(`: ping\n\n`);
        } catch {
          // ignore enqueue errors if stream is closed
        }
      }, 15000);

      if (emitter) {
        const onProgress = (d: unknown) => send(d);
        const onDone = (d: Record<string, unknown>) => {
          send({ status: "done", ...d });
          cleanup();
          controller.close();
        };
        const onError = (d: Record<string, unknown>) => {
          send({ status: "error", ...d });
          cleanup();
          controller.close();
        };
        const cleanup = () => {
          if (ping) clearInterval(ping);
          emitter.off("progress", onProgress);
          emitter.off("done", onDone);
          emitter.off("error", onError);
        };
        emitter.on("progress", onProgress);
        emitter.on("done", onDone);
        emitter.on("error", onError);
      } else {
        // No emitter available; close the stream after snapshot
        if (ping) clearInterval(ping);
        controller.close();
      }
    },
    cancel() {
      // Reader cancelled; nothing to do here, intervals/listeners cleaned in onDone/onError
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
