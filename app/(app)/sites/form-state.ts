/** State returned by the site Server Actions (they redirect on success where noted). */
export type SiteActionState = {
  error?: string;
  /** Success message for in-place updates (monitoring). */
  ok?: string;
  /** Set when the URL is already one of the org's sites. */
  existingSiteId?: string;
  /** Echo of the submitted URL, so the field keeps it after an error. */
  url?: string;
};

export const initialSiteActionState: SiteActionState = {};
