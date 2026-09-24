import { db } from "@/db/client";

import { getPracticeHub as getPracticeHubInjectable } from "./practice-service";
import type { PracticeHubView } from "./practice-types";

/**
 * Server-only entry point for `domains/practice`. `practice-service.ts` takes
 * an injected `DbClient` so it stays testable against a rolled-back
 * transaction; this binds the real app database. Import from here only in
 * server-only files, never a `"use client"` component — `./index.ts` is the
 * client-safe surface.
 */
export async function getPracticeHub(input: {
  userId: string;
  languageId: string;
}): Promise<PracticeHubView> {
  return getPracticeHubInjectable(db, input);
}
