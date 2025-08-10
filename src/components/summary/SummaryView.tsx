"use client";
import { useEffect, useMemo, useState } from "react";

type Props = {
  id: string;
  summary: any;
};

export default function SummaryView({ id, summary }: Props) {
  const scores = useMemo(() => {
    const s = summary || {};
    const clamp = (v: any) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : 0);
    return {
      performance: clamp(s.performance),
      accessibility: clamp(s.accessibility),
      bestPractices: clamp(s.bestPractices),
      seo: clamp(s.seo),
    };
  }, [summary]);

  const [anim, setAnim] = useState({ perf: 0, a11y: 0, bp: 0, seo: 0 });
  useEffect(() => {
    const t = setTimeout(() => {
      setAnim({
        perf: scores.performance,
        a11y: scores.accessibility,
        bp: scores.bestPractices,
        seo: scores.seo,
      });
    }, 100);
    return () => clearTimeout(t);
  }, [scores]);

  const chips: string[] = [];
  if (summary?.brokenLinkCount != null) chips.push(`${summary.brokenLinkCount} broken links`);
  if (summary?.imagesWithoutAlt != null) chips.push(`${summary.imagesWithoutAlt} images w/o alt`);
  if (summary?.missingSecurityHeaders) chips.push(`${summary.missingSecurityHeaders.length} missing sec headers`);
  if (summary?.accessibilityViolationCount != null)
    chips.push(`${summary.accessibilityViolationCount} a11y issues`);

  return (
    <div className="space-y-6 text-foreground">
      {/* Title & meta */}
      <div className="rounded-xl bg-card text-card-foreground p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">URL</div>
        <div className="text-lg font-medium break-all">
          {summary?.canonicalUrl || summary?.name || "Unknown"}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <span key={i} className="inline-flex items-center rounded-full bg-accent text-accent-foreground px-2 py-1 text-xs font-medium">
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Score rings */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ScoreRing label="Performance" value={anim.perf} color="#16a34a" />
        <ScoreRing label="Accessibility" value={anim.a11y} color="#2563eb" />
        <ScoreRing label="Best Practices" value={anim.bp} color="#7c3aed" />
        <ScoreRing label="SEO" value={anim.seo} color="#f59e0b" />
      </div>

      {/* Key sections */}
      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Security">
          <ListRow label="Missing Headers" value={(summary?.missingSecurityHeaders || []).length} />
          <ListRow label="Misconfigured Headers" value={(summary?.misconfiguredSecurityHeaders || []).length} />
          <ListRow label="XML-RPC Enabled" value={summary?.xmlRpcEnabled ? "Yes" : "No"} />
          <ListRow label="User Enumeration" value={summary?.userEnumerationEnabled ? "Yes" : "No"} />
        </Panel>
        <Panel title="Content & Links">
          <ListRow label="Images w/o alt" value={summary?.imagesWithoutAlt} />
          <ListRow label="Broken Links" value={summary?.brokenLinkCount} />
          <ListRow label="Broken Images" value={summary?.brokenImageCount} />
        </Panel>
      </div>

      <Panel title="Raw Data">
        <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96 text-foreground/90">
          {JSON.stringify(summary, null, 2)}
        </pre>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card text-card-foreground p-4 shadow-sm">
      <div className="font-medium mb-3">{title}</div>
      {children}
    </div>
  );
}

function ListRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{String(value ?? "-")}</span>
    </div>
  );
}

function ScoreRing({ label, value, color }: { label: string; value: number; color: string }) {
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round((value || 0) * 100);
  const offset = c * (1 - Math.max(0, Math.min(1, value)));
  return (
    <div className="rounded-xl bg-card p-4 flex flex-col items-center shadow-sm">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1200ms ease" }}
          strokeLinecap="round"
        />
      </svg>
      <div className="text-xl font-semibold mt-2">{pct}</div>
      <div className="text-xs text-neutral-600">{label}</div>
    </div>
  );
}
