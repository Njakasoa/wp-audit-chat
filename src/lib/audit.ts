import EventEmitter from "events";
import got from "got";
import * as cheerio from "cheerio";
import { prisma } from "@/lib/prisma";

const emitters = new Map<string, EventEmitter>();

export async function startAudit(url: string): Promise<string> {
  const audit = await prisma.audit.create({
    data: { url, status: "queued" },
  });
  const emitter = new EventEmitter();
  emitters.set(audit.id, emitter);
  process(audit.id, url, emitter).catch((e) => console.error(e));
  return audit.id;
}

async function process(id: string, url: string, emitter: EventEmitter) {
  try {
    emitter.emit("progress", { message: "Fetching URL..." });
    await prisma.audit.update({ where: { id }, data: { status: "running" } });
    const res = await got(url, {
      timeout: { request: 12000 },
      retry: { limit: 1 },
      headers: { "user-agent": "WP-Audit-Chat" },
    });
    const $ = cheerio.load(res.body);
    const title = $("title").first().text().trim();
    const metaDesc = $('meta[name="description"]').attr("content");
    const h1Count = $("h1").length;
    const data = {
      status: res.statusCode,
      title,
      metaDescPresent: Boolean(metaDesc),
      h1Count,
    };
    await prisma.audit.update({
      where: { id },
      data: { status: "done", summary: JSON.stringify(data) },
    });
    emitter.emit("done", data);
  } catch (e) {
    await prisma.audit.update({
      where: { id },
      data: { status: "error", summary: String(e) },
    });
    emitter.emit("error", { message: String(e) });
  } finally {
    emitter.emit("end");
    emitters.delete(id);
  }
}

export function getEmitter(id: string) {
  return emitters.get(id);
}
