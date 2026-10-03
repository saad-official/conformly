import Link from "next/link";
import { cn } from "@/lib/utils";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap motion-safe:transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-primary";

const variants = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/88",
  outline: "border border-foreground/25 bg-card text-foreground hover:border-foreground/50",
} as const;

const sizes = {
  md: "h-9 px-3.5 text-sm",
  lg: "h-12 px-5 text-base",
} as const;

export function CtaLink({
  href,
  children,
  variant = "primary",
  size = "lg",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(base, variants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}
