import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getByPublicId } from "@/lib/db/repositories/scans";
import { summarize } from "@/lib/report/summary";

export const alt = "Conformly storefront report: issues, warnings and unknown checks.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand colours from docs/spec.md section 6 (hex: next/og cannot read CSS variables).
const midnight = "#101828";
const chalk = "#F7F7F5";
const indigo = "#3538CD";
const neutral = "#596273";
const warn = "#B54708";
const fail = "#B42318";

function Stat({ value, label, colour }: { value: string; label: string; colour: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingRight: 56 }}>
      <div style={{ fontSize: 108, fontWeight: 700, lineHeight: 1, color: colour, letterSpacing: -3 }}>{value}</div>
      <div style={{ fontSize: 28, color: neutral, textTransform: "uppercase", letterSpacing: 2 }}>{label}</div>
    </div>
  );
}

export default async function ReportImage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  await connection();
  const report = await getByPublicId(publicId);
  const scan = report?.scan;
  const hostname = scan?.hostname ?? "Storefront report";
  const summary = scan && report ? (scan.summary ?? summarize(report.findings)) : null;
  const done = scan?.status === "done" && summary !== null;
  const status = !scan ? "Report not found" : scan.status === "failed" ? "Scan did not complete" : done ? null : "Scan in progress";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: chalk,
          color: midnight,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: indigo }} />
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>Conformly</div>
          <div style={{ fontSize: 24, color: neutral, marginLeft: 12 }}>EU storefront report</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: hostname.length > 28 ? 56 : 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
            {hostname}
          </div>
          <div style={{ display: "flex", marginTop: 44, paddingTop: 32, borderTop: `2px solid ${midnight}` }}>
            {done && summary ? (
              <>
                <Stat value={String(summary.issues)} label={summary.issues === 1 ? "issue" : "issues"} colour={fail} />
                <Stat value={String(summary.warnings)} label={summary.warnings === 1 ? "warning" : "warnings"} colour={warn} />
                <Stat value={String(summary.unknowns)} label="unknown" colour={neutral} />
              </>
            ) : (
              <div style={{ fontSize: 44, color: neutral, display: "flex" }}>{status}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: neutral }}>Issues found, with evidence, citation and fix. Not legal advice.</div>
      </div>
    ),
    size,
  );
}
