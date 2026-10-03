import { cn } from "@/lib/utils";
import { quiet } from "./site";

const method: { term: string; detail: string }[] = [
  {
    term: "No JavaScript",
    detail:
      "Pages are fetched server-side and read as HTML. Nothing on your store is executed, clicked or submitted. Stores that render with JavaScript are reported as a limitation, not guessed at.",
  },
  {
    term: "robots.txt honoured",
    detail: "Paths your robots.txt disallows are not fetched.",
  },
  {
    term: "12 pages at most",
    detail:
      "Home, up to four product pages, cart and checkout entry, legal pages and the account link. Each request times out after 10 seconds.",
  },
  {
    term: "Identified user agent",
    detail: "Requests carry a Conformly user agent, so your server logs show who called.",
  },
  {
    term: "30-day purge",
    detail: "Anonymous scans, their crawled text and their findings are deleted 30 days after the scan.",
  },
  {
    term: "Synthetic demo data",
    detail:
      "The example store on this site lives on a reserved .example domain, and the test fixtures are synthetic storefronts. No real shop is named.",
  },
  {
    term: "Every model call logged",
    detail:
      "The green-claims classifier is the only model call. Each one is logged with the model, the prompt version and the token counts.",
  },
];

/** Method and limits as a specification table: term on the left, detail on the right. */
export function MethodList({ className }: { className?: string }) {
  return (
    <dl className={cn("divide-y divide-foreground/15 border-y border-foreground/15", className)}>
      {method.map((item) => (
        <div key={item.term} className="grid gap-x-8 gap-y-1.5 py-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
          <dt className="font-heading font-bold">{item.term}</dt>
          <dd className={cn("max-w-2xl text-sm leading-relaxed text-pretty", quiet)}>{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
