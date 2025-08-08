import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEmitter } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const emitter = getEmitter(params.id);
  const audit = await prisma.audit.findUnique({ where: { id: params.id } });
  return new Response(
    new ReadableStream({
      start(controller) {
        function send(data: unknown) {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        }
        if (audit) send({ status: audit.status, summary: audit.summary });
        if (emitter) {
          emitter.on("progress", send);
          emitter.on("done", (d) => {
            send({ status: "done", ...d });
            controller.close();
          });
          emitter.on("error", (d) => {
            send({ status: "error", ...d });
            controller.close();
          });
        } else {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }
  );
}
