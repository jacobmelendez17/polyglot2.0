import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SandboxControls } from "@/components/admin/sandbox/sandbox-controls";
import { SandboxSnapshotView } from "@/components/admin/sandbox/sandbox-snapshot-view";
import { canAccessAdminArea } from "@/domains/admin";
import { getAdminCurriculumItems, getLevelsByLanguage } from "@/domains/curriculum/server";
import { getSandboxSnapshotForOwner } from "@/domains/sandbox/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Sandbox — Polyglot Admin",
};

/**
 * Developer sandbox route (spec 11 §53-§59). Available to both admin and
 * developer (spec 11 §53) — gated on `canAccessAdminArea`, not
 * `canManageCurriculum`, since a developer without Admin rights may use the
 * sandbox but never mutates official curriculum here regardless.
 *
 * "Open Sandbox" (browsing the live app as this persona) and time
 * simulation are deliberately not built — see progress-tracker.md's
 * Sandbox entry for why both need cross-cutting changes beyond this route.
 */
export default async function AdminSandboxPage() {
  const user = await requireUser();
  if (!canAccessAdminArea(user)) {
    forbidden();
  }

  const languageId = user.activeLanguageId;
  const [levels, itemsPage, snapshot] = await Promise.all([
    getLevelsByLanguage(languageId),
    getAdminCurriculumItems({ languageId, status: "published", limit: 100 }),
    getSandboxSnapshotForOwner(user.id, languageId),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="Sandbox"
        description="Test any curriculum level, SRS state, or unlock behavior in an environment fully isolated from real learner progress."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <SandboxControls
          languageId={languageId}
          levels={levels.map((l) => ({ id: l.id, levelNumber: l.levelNumber }))}
          items={itemsPage.items.map((i) => ({ id: i.id, itemLabel: i.itemLabel, levelId: i.levelId, levelNumber: i.levelNumber }))}
          timeOffsetSeconds={snapshot.timeOffsetSeconds}
        />
        <SandboxSnapshotView snapshot={snapshot} now={new Date()} />
      </div>
    </div>
  );
}
