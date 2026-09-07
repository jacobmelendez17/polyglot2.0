import { createHash } from "node:crypto";

/**
 * Stable content hashing for imported source records (spec 12 "Import
 * Versioning"/"Reimports"). Two things depend on it being canonical rather
 * than merely "JSON.stringify of whatever came in":
 *
 * - `dictionary_entry_versions.source_hash` decides whether a reimport is
 *   storing a genuinely new version or the same record again, so key order
 *   changing upstream must not look like a content change.
 * - `dictionary_senses.source_fingerprint` decides whether a sense's meaning
 *   actually changed, which is what escalates a selected sense to admin
 *   review.
 */

/**
 * Recursively sorts object keys so structurally identical values always
 * serialize identically. Arrays keep their order — order is meaningful in
 * source data (sense order, form order) and reordering would erase a real
 * change.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

export function hashSourceValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

/** SHA-256 of a file's bytes — `lexical_imports.file_checksum`, the idempotency key for "this exact snapshot". */
export function hashBytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Streaming SHA-256 of a file. A dump is far too large to buffer, and the
 * checksum has to be known *before* parsing starts so a repeat import can be
 * recognized and skipped in one query rather than a full pass.
 */
export async function hashFile(filePath: string): Promise<string> {
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
}
