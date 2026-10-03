import { cn } from "@/lib/utils";
import { links, quiet } from "./site";

/**
 * The anonymous scan form. Server-rendered and works without JavaScript: a
 * plain POST to the scan route, which is expected to redirect to the report.
 *
 * The field accepts a bare host ("yourstore.com") as well as a full URL, so it
 * is a text input with a URL keyboard rather than type="url", which would
 * reject addresses typed without a scheme.
 */
export function ScanForm({ id, className }: { id: string; className?: string }) {
  const inputId = `${id}-url`;
  const noteId = `${id}-note`;
  return (
    <form method="post" action={links.scanAction} className={cn("w-full max-w-xl", className)}>
      <label htmlFor={inputId} className="block text-sm font-semibold">
        Store URL
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={2048}
          pattern="\s*(https?://)?[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+(:[0-9]+)?(/\S*)?\s*"
          title="A web address such as yourstore.com or https://yourstore.com"
          placeholder="https://yourstore.example"
          aria-describedby={noteId}
          className={cn(
            "h-12 w-full min-w-0 rounded-md border sm:flex-1 border-foreground/30 bg-card px-3.5 font-mono text-base",
            "placeholder:text-foreground/60 hover:border-foreground/50",
            "focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-primary",
            "user-invalid:border-fail",
          )}
        />
        <button
          type="submit"
          className={cn(
            "h-12 shrink-0 rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary/88",
            "motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-primary",
          )}
        >
          Scan
        </button>
      </div>
      <p id={noteId} className={cn("mt-3 text-sm", quiet)}>
        One free scan, no account. Results stay on a private link for 30 days.
      </p>
    </form>
  );
}
