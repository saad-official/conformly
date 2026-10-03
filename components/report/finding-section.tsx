import { ExternalLink } from "lucide-react";
import { Verdict } from "@/components/marketing/verdict";
import type { FindingStatus } from "@/lib/checks/types";
import type { FindingRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { anchorFor, displayPath, fieldLabel, findingNumber, safeHref, verdictFor } from "./format";

const quoteBorder: Record<FindingStatus, string> = {
  fail: "border-fail",
  warn: "border-warn",
  unknown: "border-foreground/30",
  pass: "border-pass",
};

type ClaimNote = { source: "rule" | "model"; reason: string | null };

/**
 * green_claims keeps, per evidence quote, whether a rule or the model flagged
 * it and why (finding meta `claims`, same order as the evidence).
 */
function claimNotes(finding: FindingRow): Array<ClaimNote | null> {
  const claims = finding.llmMeta?.claims;
  if (finding.checkCode !== "green_claims" || !Array.isArray(claims)) return finding.evidence.map(() => null);
  return finding.evidence.map((evidence, index) => {
    const claim: unknown = claims[index];
    if (!claim || typeof claim !== "object") return null;
    const { quote, source, reason } = claim as { quote?: unknown; source?: unknown; reason?: unknown };
    if (quote !== evidence.quote) return null;
    return { source: source === "rule" ? "rule" : "model", reason: typeof reason === "string" ? reason : null };
  });
}

/** One numbered finding (spec 3.3): verdict, detail, evidence, citation, fix, and the owner's note control. */
export function FindingSection({
  index,
  finding,
  hostname,
  notes,
}: {
  index: number;
  finding: FindingRow;
  hostname: string;
  notes?: React.ReactNode;
}) {
  const number = findingNumber(index);
  const headingId = `${anchorFor(finding.checkCode)}-title`;
  const citationHref = safeHref(finding.citation.url);
  const perClaim = claimNotes(finding);
  const isPass = finding.status === "pass";

  return (
    <section
      id={anchorFor(finding.checkCode)}
      aria-labelledby={headingId}
      className="scroll-mt-6 rounded-lg border border-foreground/20 bg-card p-4 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs text-foreground/70 tabular">
            Finding {number} · severity {finding.severity}
          </p>
          <h2 id={headingId} className="mt-1 text-xl leading-snug">
            {finding.title}
          </h2>
          <p className="mt-1 font-mono text-xs break-all text-foreground/72">{finding.checkCode}</p>
        </div>
        <Verdict status={verdictFor(finding.checkCode, finding.status)} />
      </div>

      <p className="mt-4 max-w-prose leading-relaxed">{finding.detail}</p>

      {finding.evidence.length > 0 ? (
        <div className="mt-5">
          <h3 className={fieldLabel}>Evidence · {finding.evidence.length}</h3>
          <ul className="mt-2 space-y-3">
            {finding.evidence.map((evidence, i) => {
              const href = safeHref(evidence.url);
              const note = perClaim[i];
              return (
                <li key={`${evidence.url}-${i}`} className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] text-foreground/72">
                    {href ? (
                      <a
                        href={href}
                        rel="nofollow noopener noreferrer"
                        title={evidence.url}
                        className="break-all underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
                      >
                        {displayPath(evidence.url, hostname)}
                      </a>
                    ) : (
                      <span className="break-all">{evidence.url}</span>
                    )}
                    {note ? (
                      <span className="rounded-sm border border-primary/40 px-1.5 py-0.5 text-[0.625rem] text-primary">
                        {note.source === "rule" ? "rule" : "rule + model"}
                      </span>
                    ) : null}
                  </p>
                  <blockquote
                    className={cn(
                      "mt-1.5 border-l-2 pl-3 font-mono text-[0.8125rem] leading-relaxed break-words",
                      quoteBorder[finding.status],
                    )}
                  >
                    &ldquo;{evidence.quote}&rdquo;
                  </blockquote>
                  {note?.reason ? <p className="mt-1 pl-3.5 text-xs text-foreground/72">{note.reason}</p> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className={fieldLabel}>Citation</h3>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <cite className="font-mono text-xs not-italic">
            {finding.citation.law}
            {finding.citation.article ? `, ${finding.citation.article}` : ""}
          </cite>
          {citationHref ? (
            <a
              href={citationHref}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline decoration-primary/40 underline-offset-[3px] hover:decoration-primary"
            >
              Read the text
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          ) : null}
        </p>
      </div>

      {!isPass || finding.fix.html ? (
        <div className="mt-5">
          <h3 className={fieldLabel}>{isPass ? "Reference" : "Fix"}</h3>
          <p className="mt-1 max-w-prose text-sm leading-relaxed">{finding.fix.summary}</p>
          {finding.fix.html ? (
            <div className="mt-2 overflow-hidden rounded-md bg-foreground text-background">
              <div className="flex items-center justify-between gap-3 border-b border-background/15 py-1.5 pr-1.5 pl-3">
                <span className="font-mono text-[0.6875rem] tracking-wide text-background/75 uppercase">HTML</span>
                <CopyButton text={finding.fix.html} label="Copy HTML" />
              </div>
              <pre className="overflow-x-auto px-3 py-3 font-mono text-xs leading-relaxed">
                <code>{finding.fix.html}</code>
              </pre>
            </div>
          ) : null}
          {finding.fix.shopify ? (
            <p className="mt-2 text-xs leading-relaxed text-foreground/75">
              <span className="font-semibold text-foreground">Shopify:</span> {finding.fix.shopify}
            </p>
          ) : null}
        </div>
      ) : null}

      {notes ? <div className="mt-5 border-t border-foreground/15 pt-4">{notes}</div> : null}
    </section>
  );
}
