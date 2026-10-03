import { PublicShell } from "@/components/report/public-shell";

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
