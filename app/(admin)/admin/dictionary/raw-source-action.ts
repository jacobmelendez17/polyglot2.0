"use server";

import { z } from "zod";

import { canManageCurriculum } from "@/domains/admin";
import { getEntryRawVersions } from "@/domains/lexicon/server";
import { requireUser } from "@/domains/users/server";

/**
 * Raw source inspection, kept in its own module rather than beside the
 * mapping mutations: it is the one action that returns upstream content, and
 * separating it makes that boundary obvious at every call site.
 *
 * Serializes to a string here rather than returning the parsed object, so the
 * client component has nothing to render but text — spec 12 forbids
 * rendering upstream markup, and a string cannot become one by accident.
 */

export type RawSourceResult =
  | { ok: true; data: { id: string; sourceHash: string; createdAt: string; json: string }[] }
  | { ok: false; error: { code: string; message: string } };

const inputSchema = z.object({ entryId: z.string().min(1) });

/** Bounded deliberately: an entry's full version history could be dozens of large objects, and the dialog shows the most recent few. */
const VERSION_LIMIT = 3;

export async function getEntryRawVersionsAction(input: z.infer<typeof inputSchema>): Promise<RawSourceResult> {
  try {
    const user = await requireUser();
    if (!canManageCurriculum(user)) {
      return { ok: false, error: { code: "FORBIDDEN", message: "You don't have access to do that." } };
    }
    const parsed = inputSchema.parse(input);
    const versions = await getEntryRawVersions(parsed.entryId, VERSION_LIMIT);
    return {
      ok: true,
      data: versions.map((version) => ({
        id: version.id,
        sourceHash: version.sourceHash,
        createdAt: version.createdAt.toISOString(),
        json: JSON.stringify(version.rawData, null, 2),
      })),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: "That request could not be understood." } };
    }
    console.error("Unexpected raw-source action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}
