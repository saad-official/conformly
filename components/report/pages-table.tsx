import type { ScanPage } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { displayPath, fieldLabel, safeHref } from "./format";

/** "Pages crawled" (spec 3.3): every fetched page in crawl order with its kind and HTTP status. */
export function PagesTable({ pages, hostname }: { pages: readonly ScanPage[]; hostname: string }) {
  return (
    <section aria-labelledby="pages-crawled" className="scroll-mt-6">
      <h2 id="pages-crawled" className="text-xl">
        Pages crawled <span className="font-mono text-base font-medium text-foreground/70 tabular">· {pages.length}</span>
      </h2>
      {pages.length === 0 ? (
        <p className="mt-2 text-sm text-foreground/75">No pages were stored for this scan.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-foreground/20 bg-card">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-foreground/15">
                <th scope="col" className={cn(fieldLabel, "px-4 py-2.5")}>
                  Page
                </th>
                <th scope="col" className={cn(fieldLabel, "px-4 py-2.5")}>
                  Kind
                </th>
                <th scope="col" className={cn(fieldLabel, "px-4 py-2.5 text-right")}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const href = safeHref(page.finalUrl ?? page.url);
                const ok = page.statusCode >= 200 && page.statusCode < 300;
                return (
                  <tr key={page.id} className="border-b border-foreground/10 last:border-b-0">
                    <td className="max-w-0 px-4 py-2 font-mono text-xs">
                      {href ? (
                        <a
                          href={href}
                          rel="nofollow noopener noreferrer"
                          title={page.url}
                          className="block truncate underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
                        >
                          {displayPath(page.url, hostname)}
                        </a>
                      ) : (
                        <span className="block truncate">{page.url}</span>
                      )}
                      {page.title ? <span className="block truncate font-sans text-xs text-foreground/70">{page.title}</span> : null}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{page.kind}</td>
                    <td className={cn("px-4 py-2 text-right font-mono text-xs tabular", ok ? "text-foreground/80" : "font-semibold text-fail")}>
                      {page.statusCode}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
