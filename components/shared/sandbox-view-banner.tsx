"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FlaskConical } from "lucide-react";

import { closeSandboxAction } from "@/app/(admin)/admin/sandbox/actions";

/**
 * Shown on every authenticated page while an admin is viewing the app as
 * their sandbox persona (spec 11's "Open Sandbox").
 *
 * Always visible, never dismissible. An impersonation session that an admin
 * can forget they are in is the failure mode worth designing against: every
 * lesson completed and every review answered while it is active writes to the
 * persona, not to them, and the only way to tell would otherwise be noticing
 * that their own progress stopped moving.
 */
export function SandboxViewBanner() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-state-warning/15 px-4 py-2 text-center text-sm text-foreground"
    >
      <span className="flex items-center gap-1.5 font-medium">
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        Viewing as your sandbox persona
      </span>
      <span className="text-muted-foreground">
        Progress here is isolated and affects no real learner.
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await closeSandboxAction();
            router.push("/admin/sandbox");
            router.refresh();
          })
        }
        className="rounded-md px-2 py-0.5 font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Exit sandbox view
      </button>
    </div>
  );
}
