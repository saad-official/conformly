import Link from "next/link";
import { cn } from "@/lib/utils";
import { focusRing } from "./site";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("inline-flex items-center gap-2 font-heading text-lg font-bold tracking-tight", focusRing, className)}
    >
      <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
      Conformly
    </Link>
  );
}
