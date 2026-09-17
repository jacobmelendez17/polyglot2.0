import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

/**
 * Streaming JSONL reader for source dumps (spec 12 "Controlled Import":
 * stream input, use bounded memory). A Kaikki extract is far too large to
 * read into memory, so nothing here ever holds more than one line at a time
 * — the caller decides what to retain.
 *
 * `.gz` input is decompressed in the same stream rather than requiring the
 * operator to expand a multi-gigabyte file first. Node built-ins only; no
 * dependency was added for this.
 */

/** Refuses absurd input before a single byte is parsed (spec 12 "Security": maximum import file size). */
const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024 * 1024;

/** A single pathological line must not be able to exhaust memory on its own. */
const MAX_LINE_BYTES = 4 * 1024 * 1024;

export interface JsonlLine {
  /** 1-based line number, for operator-facing diagnostics. */
  lineNumber: number;
  /** `null` when the line was not parseable JSON or exceeded the line-size guard. */
  value: unknown;
  parseError: string | null;
}

export function assertImportFileSize(
  filePath: string,
  maxBytes: number = DEFAULT_MAX_FILE_BYTES,
): number {
  const { size } = statSync(filePath);
  if (size > maxBytes) {
    throw new Error(
      `Import file exceeds the maximum permitted size (${size} bytes > ${maxBytes} bytes): ${filePath}`,
    );
  }
  return size;
}

/**
 * Yields one parsed line at a time. A malformed line is reported through
 * `parseError` rather than thrown: spec 12's fixture set includes a
 * deliberately malformed row, and one bad record in a million-line dump must
 * be counted and skipped, never allowed to abort the import.
 */
export async function* readJsonlFile(
  filePath: string,
): AsyncGenerator<JsonlLine> {
  const fileStream = createReadStream(filePath);
  const input = filePath.endsWith(".gz")
    ? fileStream.pipe(createGunzip())
    : fileStream;
  const lines = createInterface({ input, crlfDelay: Infinity });

  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber += 1;
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      if (Buffer.byteLength(trimmed, "utf8") > MAX_LINE_BYTES) {
        yield {
          lineNumber,
          value: null,
          parseError: "line exceeds maximum permitted size",
        };
        continue;
      }
      try {
        yield {
          lineNumber,
          value: JSON.parse(trimmed) as unknown,
          parseError: null,
        };
      } catch {
        yield { lineNumber, value: null, parseError: "invalid JSON" };
      }
    }
  } finally {
    lines.close();
    fileStream.destroy();
  }
}
