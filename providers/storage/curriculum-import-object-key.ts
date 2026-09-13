/**
 * The S3 object key an uploaded curriculum import's source file lives at
 * (spec 19 §6): `imports/{importId}/source.{csv|tsv}`. Decided once, here,
 * rather than string-templated at each call site — the preview Lambda,
 * commit Lambda, and permanent-deletion path (once it deletes the S3 object
 * too — see progress-tracker.md) all need the exact same key for the same
 * import, and this is a pure function so every one of them can be tested
 * without touching S3.
 */
export function curriculumImportObjectKey(importId: string, fileExtension: "csv" | "tsv"): string {
  return `imports/${importId}/source.${fileExtension}`;
}

const OBJECT_KEY_PATTERN = /^imports\/([0-9a-fA-F-]{36})\/source\.(csv|tsv)$/;

/**
 * The inverse of `curriculumImportObjectKey` — recovers `importId` from an
 * S3 `ObjectCreated` event's key (spec 19 §7's preview trigger), which
 * carries only the key, never the import id directly. Returns `null` for
 * anything that isn't this exact shape rather than throwing, so a caller
 * receiving an unexpected key (a stray object, a hand-crafted test upload)
 * can decide how to handle it instead of crashing the whole batch.
 */
export function parseCurriculumImportObjectKey(key: string): { importId: string; fileExtension: "csv" | "tsv" } | null {
  const match = OBJECT_KEY_PATTERN.exec(key);
  if (!match) return null;
  return { importId: match[1]!, fileExtension: match[2] as "csv" | "tsv" };
}
