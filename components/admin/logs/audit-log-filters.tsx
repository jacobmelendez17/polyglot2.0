"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ADMIN_AUDIT_ACTIONS, type AdminAuditAction } from "@/domains/admin";

const ALL_VALUE = "all";

type AuditLogFiltersProps = {
  value: {
    actorUserId?: string;
    action?: AdminAuditAction;
    resourceType?: string;
    resourceId?: string;
    from?: string;
    to?: string;
  };
};

/**
 * Spec 11 rewrite's Audit Logs filters (actor, action, resource type, date
 * range, resource/search). No actor picker exists yet (there's no "list
 * admins" read model to build one from) — actor and resource type/id are
 * plain text fields accepting a raw ID, a real if unpolished way to satisfy
 * the filter requirement without inventing a new lookup UI for this pass.
 */
export function AuditLogFilters({ value }: AuditLogFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [actorDraft, setActorDraft] = useState(value.actorUserId ?? "");
  const [resourceTypeDraft, setResourceTypeDraft] = useState(
    value.resourceType ?? "",
  );
  const [resourceIdDraft, setResourceIdDraft] = useState(
    value.resourceId ?? "",
  );

  function navigate(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const next = { ...value, ...overrides };
    if (next.actorUserId) params.set("actor", next.actorUserId);
    if (next.action) params.set("action", next.action);
    if (next.resourceType) params.set("resourceType", next.resourceType);
    if (next.resourceId) params.set("resourceId", next.resourceId);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <form
      className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        navigate({
          actorUserId: actorDraft.trim() || undefined,
          resourceType: resourceTypeDraft.trim() || undefined,
          resourceId: resourceIdDraft.trim() || undefined,
        });
      }}
    >
      <label className="block text-sm sm:w-40">
        <span className="sr-only">Actor user ID</span>
        <Input
          placeholder="Actor ID"
          value={actorDraft}
          onChange={(e) => setActorDraft(e.target.value)}
        />
      </label>

      <Select
        value={value.action ?? ALL_VALUE}
        onValueChange={(action) =>
          navigate({
            action:
              action === ALL_VALUE ? undefined : (action as AdminAuditAction),
          })
        }
      >
        <SelectTrigger aria-label="Action" className="sm:w-56">
          <SelectValue placeholder="Action" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All actions</SelectItem>
          {ADMIN_AUDIT_ACTIONS.map((action) => (
            <SelectItem key={action} value={action}>
              {action}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="block text-sm sm:w-36">
        <span className="sr-only">Resource type</span>
        <Input
          placeholder="Resource type"
          value={resourceTypeDraft}
          onChange={(e) => setResourceTypeDraft(e.target.value)}
        />
      </label>

      <label className="block text-sm sm:w-44">
        <span className="sr-only">Resource ID</span>
        <Input
          placeholder="Resource ID"
          value={resourceIdDraft}
          onChange={(e) => setResourceIdDraft(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="sr-only">From date</span>
        <Input
          type="date"
          aria-label="From date"
          value={value.from ?? ""}
          onChange={(e) => navigate({ from: e.target.value || undefined })}
        />
      </label>

      <label className="block text-sm">
        <span className="sr-only">To date</span>
        <Input
          type="date"
          aria-label="To date"
          value={value.to ?? ""}
          onChange={(e) => navigate({ to: e.target.value || undefined })}
        />
      </label>

      <Button type="submit" variant="outline">
        Apply
      </Button>
    </form>
  );
}
