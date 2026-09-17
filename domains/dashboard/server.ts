import { db } from "@/db/client";

import { getDashboardData as getDashboardDataInjectable } from "./dashboard-service";
import type { DashboardData } from "./dashboard-types";

/**
 * Server-only entry point for `domains/dashboard`. `dashboard-service.ts`'s
 * `getDashboardData` takes an injected `DbClient` (so it stays testable
 * against a rolled-back transaction, per that file's own docstring) — this
 * binds the real app database, the same split `domains/srs/review-service.ts`
 * and `domains/progress/service.ts` use. Import from here only in
 * server-only files, never a `"use client"` component. `./index.ts` stays
 * safe for a client component to value-import (types only).
 */
export async function getDashboardData(input: {
  userId: string;
  languageId: string;
}): Promise<DashboardData> {
  return getDashboardDataInjectable(db, input);
}
