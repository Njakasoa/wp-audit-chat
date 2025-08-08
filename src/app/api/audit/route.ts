import { NextRequest, NextResponse } from "next/server";
import { auditRequestSchema } from "@/lib/validators";
import { normalizeUrl } from "@/lib/url";
import { startAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url } = auditRequestSchema.parse(body);
  const id = await startAudit(normalizeUrl(url));
  return NextResponse.json({ auditId: id });
}
