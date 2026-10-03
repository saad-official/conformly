import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const heading = Manrope({ variable: "--font-heading", subsets: ["latin"], weight: ["600", "700", "800"], display: "swap" });
const body = Inter({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Conformly — EU storefront compliance, checked and watched",
    template: "%s · Conformly",
  },
  description:
    "Scan an online shop for the EU rules that landed in 2025 and 2026: withdrawal function, green claims, accessibility statement, AI-chatbot disclosure, cookie consent and legal notice. Evidence, citations and fixes, with monthly re-scans.",
  openGraph: {
    title: "Conformly — EU storefront compliance, checked and watched",
    description: "One URL in. A pass/fail matrix with evidence, legal citations and copy-paste fixes out.",
    type: "website",
    url: appUrl,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
        <Analytics />
      </body>
    </html>
  );
}
