import { ImageResponse } from "next/og";

export const alt = "Conformly: EU storefront compliance, checked and watched.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand colours from docs/spec.md section 6 (hex, since next/og cannot read CSS variables).
const midnight = "#101828";
const chalk = "#F7F7F5";
const indigo = "#3538CD";
const neutral = "#596273";
const pass = "#067647";
const warn = "#B54708";
const fail = "#B42318";
const ruleLine = "rgba(16, 24, 40, 0.07)";
const LINE = 32;

/** The example report's verdicts, top to bottom, as a matrix rail. */
const rail = [fail, pass, fail, warn, warn, pass, neutral, fail, neutral];

/** Ruled-paper lines drawn as hairline divs: Satori has no repeating backgrounds. */
function Ruled() {
  const rows = Array.from({ length: Math.floor(size.height / LINE) }, (_, i) => (i + 1) * LINE - 1);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex" }}>
      {rows.map((y) => (
        <div
          key={y}
          style={{ position: "absolute", left: 0, top: y, height: 1, width: size.width, background: ruleLine }}
        />
      ))}
    </div>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          background: chalk,
          color: midnight,
          fontFamily: "sans-serif",
        }}
      >
        <Ruled />
        <div
          style={{
            position: "relative",
            display: "flex",
            width: "100%",
            height: "100%",
            padding: "72px 80px 64px",
            gap: 72,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ width: 26, height: 26, borderRadius: 13, background: indigo }} />
              <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>Conformly</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", flexDirection: "column", fontSize: 76, lineHeight: 1.08, letterSpacing: -2 }}>
                <div>EU storefront compliance,</div>
                <div>checked and watched.</div>
              </div>
              <div
                style={{
                  marginTop: 36,
                  paddingTop: 20,
                  borderTop: `2px solid ${midnight}`,
                  fontSize: 26,
                  color: neutral,
                  display: "flex",
                }}
              >
                Issues found, with evidence, citation and fix. Not legal advice.
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 14,
              paddingLeft: 28,
              borderLeft: `2px solid ${midnight}`,
            }}
          >
            {rail.map((colour, index) => (
              <div key={index} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 18, color: neutral, width: 28, display: "flex" }}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: colour }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
