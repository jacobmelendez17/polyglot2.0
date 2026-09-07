"use client";

import { useRouter } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type LogsTabsNavProps = { active: "audit" | "system" };

/** Spec 11 rewrite's Audit Logs route: Audit/System tabs, Audit default. URL-driven (not component state) so a tab choice is bookmarkable/shareable. */
export function LogsTabsNav({ active }: LogsTabsNavProps) {
  const router = useRouter();

  return (
    <Tabs value={active} onValueChange={(tab) => router.push(`/admin/logs?tab=${tab}`)} className="mb-4">
      <TabsList>
        <TabsTrigger value="audit">Audit</TabsTrigger>
        <TabsTrigger value="system">System</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
