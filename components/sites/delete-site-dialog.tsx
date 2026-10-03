"use client";

import { useActionState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteSite } from "@/app/(app)/sites/actions";
import { initialSiteActionState } from "@/app/(app)/sites/form-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Owner-only delete with a confirmation step. Scans and their report links are kept. */
export function DeleteSiteDialog({ siteId, hostname }: { siteId: string; hostname: string }) {
  const [state, formAction, pending] = useActionState(deleteSite, initialSiteActionState);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 aria-hidden />
          Delete site
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {hostname}?</DialogTitle>
          <DialogDescription>
            Monitoring stops and the site&apos;s finding notes and alerts are removed. Past scans stay in Scans, and
            their report links keep working.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="contents">
          <input type="hidden" name="siteId" value={siteId} />
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              {pending ? "Deleting" : "Delete site"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
