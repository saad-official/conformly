import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatDateTime, quiet, scanTime } from "@/components/dashboard/format";
import { StatusPill, VerdictPill } from "@/components/dashboard/verdict-pill";
import type { Scan } from "@/lib/db/types";
import type { FindingChange, ScanDiff } from "@/lib/services/monitor";
import { cn } from "@/lib/utils";

const GROUPS: Array<{ key: "new" | "resolved" | "changed"; title: string; empty: string; tone: string }> = [
  { key: "new", title: "New", empty: "No new issues or warnings.", tone: "border-l-fail" },
  { key: "resolved", title: "Resolved", empty: "Nothing resolved.", tone: "border-l-pass" },
  { key: "changed", title: "Changed", empty: "No other changes.", tone: "border-l-indigo" },
];

function Transition({ change }: { change: FindingChange }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {change.before ? <StatusPill status={change.before} /> : <VerdictPill tone="muted">none</VerdictPill>}
      <ArrowRight className="size-3.5 text-foreground/50" aria-label="to" />
      {change.after ? <StatusPill status={change.after} /> : <VerdictPill tone="muted">none</VerdictPill>}
    </span>
  );
}

/** New / resolved / changed findings between the last two finished scans, by check status and fingerprint. */
export function ScanDiffView({
  diff,
  latest,
  previous,
  timeZone,
}: {
  diff: ScanDiff;
  latest: Scan;
  previous: Scan;
  timeZone: string;
}) {
  const total = diff.new.length + diff.resolved.length + diff.changed.length;
  return (
    <div className="@container rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10">
      <p className={cn("text-sm", quiet)}>
        <Link href={`/r/${previous.publicId}`} className="font-mono text-foreground hover:underline">
          {formatDateTime(scanTime(previous), timeZone)}
        </Link>{" "}
        →{" "}
        <Link href={`/r/${latest.publicId}`} className="font-mono text-foreground hover:underline">
          {formatDateTime(scanTime(latest), timeZone)}
        </Link>
        {total === 0 ? ` · No changes across ${diff.unchanged} checks.` : ` · ${diff.unchanged} checks unchanged.`}
      </p>
      {total > 0 ? (
        <div className="mt-4 grid gap-4 @2xl:grid-cols-3">
          {GROUPS.map((group) => {
            const items = diff[group.key];
            return (
              <section key={group.key} aria-label={`${group.title} findings`} className={cn("border-l-2 pl-3", group.tone)}>
                <h3 className="font-heading text-sm">
                  {group.title} <span className="tabular font-mono text-foreground/60">{items.length}</span>
                </h3>
                {items.length === 0 ? (
                  <p className={cn("mt-1 text-sm", quiet)}>{group.empty}</p>
                ) : (
                  <ul className="mt-2 grid gap-3">
                    {items.map((change) => (
                      <li key={change.checkCode} className="grid gap-1">
                        <p className="text-sm font-medium">{change.title}</p>
                        <p className="font-mono text-xs text-foreground/60">{change.checkCode}</p>
                        <Transition change={change} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
