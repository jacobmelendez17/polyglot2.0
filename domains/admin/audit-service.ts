import { db } from "@/db/client";

import * as repository from "./audit-repository";
import type { GetAuditEventsInput, RecordAuditEventInput } from "./audit-types";

/**
 * Binds the real app database to the injectable audit repository functions
 * — see `domains/srs/review-service.ts` for the same pattern. Not guarded
 * with `import "server-only"` directly — importing `db` from `db/client.ts`
 * already carries that guard transitively.
 */

export async function recordAuditEvent(input: RecordAuditEventInput) {
  return repository.recordAuditEvent(db, input);
}

export async function getAuditEvents(input: GetAuditEventsInput) {
  return repository.getAuditEvents(db, input);
}
