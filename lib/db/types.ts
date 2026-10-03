/**
 * Row types inferred from lib/db/schema.ts. Type-only: safe to import from
 * client components (e.g. `Plan` in the app shell).
 */
import type {
  agentEvents,
  alerts,
  findingNotes,
  findings,
  memberships,
  organizations,
  outbox,
  scanPages,
  scans,
  session,
  sites,
  user,
} from "./schema";

export type { Db, DbHandle, Schema } from "./client";
export type { ScanLimitations } from "./schema";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Plan = Organization["plan"];

export type Membership = typeof memberships.$inferSelect;
export type MembershipRole = Membership["role"];

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;

export type Scan = typeof scans.$inferSelect;
export type NewScan = typeof scans.$inferInsert;
export type ScanStatus = Scan["status"];

export type ScanPage = typeof scanPages.$inferSelect;
export type NewScanPage = typeof scanPages.$inferInsert;

/** A persisted finding (the check output is `Finding` in lib/checks/types). */
export type FindingRow = typeof findings.$inferSelect;
export type NewFindingRow = typeof findings.$inferInsert;

export type FindingNote = typeof findingNotes.$inferSelect;
export type NoteState = FindingNote["state"];

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;

export type OutboxMessage = typeof outbox.$inferSelect;
export type NewOutboxMessage = typeof outbox.$inferInsert;

export type AgentEvent = typeof agentEvents.$inferSelect;
export type NewAgentEvent = typeof agentEvents.$inferInsert;
export type Actor = AgentEvent["actor"];

/** A scan with everything the report page needs. */
export type ScanReport = {
  scan: Scan;
  pages: ScanPage[];
  findings: FindingRow[];
};
