import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import SummaryView from "@/components/summary/SummaryView";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function SummaryPage({ params }: { params: Params }) {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({ where: { id } });
  if (!audit) return notFound();
  let summary: any = null;
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
        <SummaryView id={id} summary={summary} />
      </div>
    </div>
  );
}
