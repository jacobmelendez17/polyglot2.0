import Link from "next/link";
import type { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { canManageCurriculum } from "@/domains/admin";
import { requireUser } from "@/domains/users/server";

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
 * assign this page to one, so it's built minimally here: navigation plus
 * an honest explanation of what isn't available yet, rather than
 * fabricated stat cards (Published/Pending/Draft/Archived counts) that
 * need Unit 3's curriculum read model. Content is deliberately role-
 * branched — a developer-only account never sees curriculum-management
 * shortcuts it isn't permitted to use (spec 11 §4).
 */
export default async function AdminOverviewPage() {
  const user = await requireUser();
  const canManage = canManageCurriculum(user);
  const links = canManage ? [...QUICK_LINKS, ...SHARED_LINKS] : SHARED_LINKS;

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

      {canManage ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Curriculum statistics will appear here once the curriculum admin read model is available.
        </p>
      ) : null}
    </div>
  );
}
