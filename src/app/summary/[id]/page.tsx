import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import SummaryView from "@/components/summary/SummaryView";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function SummaryPage({ params }: { params: Params }) {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({ where: { id } });
  if (!audit) return notFound();
  type Summary = {
    canonicalUrl?: string | null;
    name?: string | null;
    brokenLinkCount?: number;
    imagesWithoutAlt?: number;
    missingSecurityHeaders?: unknown[];
    accessibilityViolationCount?: number;
    performance?: number;
    accessibility?: number;
    bestPractices?: number;
    seo?: number;
    misconfiguredSecurityHeaders?: unknown[];
    xmlRpcEnabled?: boolean;
    userEnumerationEnabled?: boolean;
    brokenImageCount?: number;
    [key: string]: unknown;
  } | null;
  let summary: Summary = null;
  try {
    summary = audit.summary ? JSON.parse(audit.summary as unknown as string) : null;
  } catch {
    summary = null;
  }
  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto text-foreground">
        <h1 className="text-2xl font-semibold mb-2">Audit Summary</h1>
        <p className="text-sm text-muted-foreground mb-6">Audit ID: {id}</p>
        <SummaryView summary={summary} />
      </div>
    </div>
  );
}
