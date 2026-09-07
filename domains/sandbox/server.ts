/**
 * Server-only entry point for `domains/sandbox`. `./sandbox-mutation-service.ts`
 * transitively imports `db/client.ts` — import from here only in server-only
 * files, never a `"use client"` component. `./index.ts` stays safe for a
 * client component to value-import (types only). Same split as every other
 * domain's `server.ts`/`index.ts` pair.
 */
export {
  getSandboxSnapshotForOwner,
  makeSandboxReviewsDue,
  resetSandboxForOwner,
  setSandboxItemStage,
  simulateLevelForSandbox,
} from "./sandbox-mutation-service";
export type {
  MakeSandboxReviewsDueServiceInput,
  ResetSandboxServiceInput,
  SetSandboxItemStageServiceInput,
  SimulateLevelServiceInput,
} from "./sandbox-service";
