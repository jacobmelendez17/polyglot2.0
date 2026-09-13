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
