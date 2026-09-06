import Link from "next/link";
import type { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { canManageCurriculum } from "@/domains/admin";
import { getAdminCurriculumStatusCounts } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

const STAT_LABELS = [
  { key: "published", label: "Published" },
  { key: "pending", label: "Pending" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
] as const;

export const metadata: Metadata = {
  title: "Admin Overview — Polyglot",
};

const QUICK_LINKS = [
  { label: "Curriculum", href: "/admin/curriculum", description: "Browse and manage official curriculum." },
] as const;

const SHARED_LINKS = [
  { label: "Logs", href: "/admin/logs", description: "Review administrative and system activity." },
  { label: "Sandbox", href: "/admin/sandbox", description: "Test learning behavior in an isolated environment." },
] as const;

/**
 * Admin Overview (spec 11 §7). Spec 11's own 13 implementation units never
 * assign this page to one, so it's built minimally: navigation, plus real
 * stat cards now that Unit 3's curriculum read model exists (scoped to the
 * admin's own active language — Overview has no language-filter URL state
 * of its own the way `/admin/curriculum` does; switch languages there for
 * a different language's counts). Content is deliberately role-branched —
 * a developer-only account never sees curriculum-management shortcuts it
 * isn't permitted to use (spec 11 §4).
 */
export default async function AdminOverviewPage() {
  const user = await requireUser();
  const canManage = canManageCurriculum(user);
  const links = canManage ? [...QUICK_LINKS, ...SHARED_LINKS] : SHARED_LINKS;
  const counts = canManage ? await getAdminCurriculumStatusCounts(user.activeLanguageId) : null;

  return (
    <div>
      <AdminPageHeader
        title="Overview"
        description={
          canManage
            ? "Manage official curriculum, logs, and the developer sandbox."
            : "You have developer access to the sandbox and logs. Curriculum management requires an admin role."
        }
      />

      {counts ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STAT_LABELS.map(({ key, label }) => (
            <div key={key} className="rounded-xl border border-border bg-card p-4">
              <p className="text-2xl font-semibold text-foreground">{counts[key]}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
          >
            <p className="font-medium text-foreground">{link.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{link.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
