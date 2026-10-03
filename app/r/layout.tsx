import { PublicShell } from "@/components/report/public-shell";

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
