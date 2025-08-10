"use client";
import { useEffect, useMemo, useState } from "react";

type Summary = {
  canonicalUrl?: string | null;
  name?: string | null;
  brokenLinkCount?: number;
  imagesWithoutAlt?: number;
  missingSecurityHeaders?: unknown[];
  missingOpenGraph?: string[];
  missingTwitter?: string[];
  accessibilityViolationCount?: number;
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
  misconfiguredSecurityHeaders?: unknown[];
  xmlRpcEnabled?: boolean;
  userEnumerationEnabled?: boolean;
  brokenImageCount?: number;
  h1Count?: number;
  hasMultipleH1?: boolean;
  pageSamples?: {
    url: string;
    status: number;
    title?: string;
    imgWithoutAltCount?: number;
  }[];
  [key: string]: unknown;
} | null;

type Props = {
  summary: Summary;
};

export default function SummaryView({ summary }: Props) {
  const scores = useMemo(() => {
    const s = summary || {};
    const clamp = (v: unknown) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : 0);
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
          <div className="mt-3">
            <StackedBar
              total={8}
              missing={(summary?.missingSecurityHeaders as unknown[] | undefined)?.length ?? 0}
              label="Security Headers"
              presentLabel="Present"
              missingLabel="Missing"
              colors={{ present: "#16a34a", missing: "#ef4444" }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {(summary?.missingSecurityHeaders as string[] | undefined)?.map((h) => (
                <span key={h} className="inline-flex items-center rounded-full bg-muted text-foreground px-2 py-0.5 text-[11px]">
                  {h}
                </span>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="Content & Links">
          <ListRow label="Images w/o alt" value={summary?.imagesWithoutAlt} />
          <ListRow label="Broken Links" value={summary?.brokenLinkCount} />
          <ListRow label="Broken Images" value={summary?.brokenImageCount} />
          <div className="mt-3 space-y-3">
            <StackedBar
              total={3}
              missing={(summary?.missingOpenGraph as string[] | undefined)?.length ?? 0}
              label="Open Graph Tags"
              presentLabel="Present"
              missingLabel="Missing"
              colors={{ present: "#2563eb", missing: "#f59e0b" }}
            />
            <StackedBar
              total={4}
              missing={(summary?.missingTwitter as string[] | undefined)?.length ?? 0}
              label="Twitter Card Tags"
              presentLabel="Present"
              missingLabel="Missing"
              colors={{ present: "#2563eb", missing: "#f59e0b" }}
            />
          </div>
        </Panel>
      </div>

      {/* Pages overview */}
      <Panel title="Pages Overview">
        {Array.isArray(summary?.pageSamples) && summary?.pageSamples?.length ? (
          <BarChart
            data={(summary?.pageSamples || []).map((p) => ({
              label: new URL(p.url).pathname || "/",
              value: p.imgWithoutAltCount ?? 0,
            }))}
            label="Images without alt per page"
          />
        ) : (
          <div className="text-sm text-muted-foreground">No page samples available.</div>
        )}
      </Panel>

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

function ListRow({ label, value }: { label: string; value: unknown }) {
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

function StackedBar({
  total,
  missing,
  label,
  presentLabel,
  missingLabel,
  colors,
}: {
  total: number;
  missing: number;
  label: string;
  presentLabel: string;
  missingLabel: string;
  colors: { present: string; missing: string };
}) {
  const present = Math.max(0, total - Math.max(0, missing));
  const presentPct = total > 0 ? (present / total) * 100 : 0;
  const missingPct = total > 0 ? (missing / total) * 100 : 0;
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="w-full h-3 bg-muted rounded overflow-hidden flex">
        <div style={{ width: `${presentPct}%`, backgroundColor: colors.present }} />
        <div style={{ width: `${missingPct}%`, backgroundColor: colors.missing }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {presentLabel}: <span className="text-foreground font-medium">{present}</span>
        </span>
        <span>
          {missingLabel}: <span className="text-foreground font-medium">{missing}</span>
        </span>
      </div>
    </div>
  );
}

function BarChart({
  data,
  label,
}: {
  data: { label: string; value: number }[];
  label: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barColor = "#6b7280"; // neutral-500
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <div className="grid gap-2">
        {data.map((d) => {
          const width = `${(d.value / max) * 100}%`;
          return (
            <div key={`${d.label}`} className="text-xs">
              <div className="flex items-center justify-between">
                <span className="truncate max-w-[60%]" title={d.label}>{d.label}</span>
                <span className="text-muted-foreground">{d.value}</span>
              </div>
              <div className="h-2 bg-muted rounded">
                <div className="h-2 rounded" style={{ width, backgroundColor: barColor }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
