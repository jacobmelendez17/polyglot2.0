import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterAll, describe, expect, it } from "vitest";

import { assertImportFileSize, readJsonlFile } from "./jsonl-stream";

const directory = mkdtempSync(join(tmpdir(), "polyglot-jsonl-"));

function writeFixture(name: string, content: string | Buffer): string {
  const path = join(directory, name);
  writeFileSync(path, content);
  return path;
}

async function collect(path: string) {
  const lines = [];
  for await (const line of readJsonlFile(path)) lines.push(line);
  return lines;
}

afterAll(() => {
  // The OS reclaims the temp directory; nothing here writes outside it.
});

describe("readJsonlFile", () => {
  it("streams one parsed object per line", async () => {
    const path = writeFixture(
      "simple.jsonl",
      '{"word":"padre"}\n{"word":"madre"}\n',
    );
    const lines = await collect(path);
    expect(lines.map((line) => line.value)).toEqual([
      { word: "padre" },
      { word: "madre" },
    ]);
    expect(lines.map((line) => line.lineNumber)).toEqual([1, 2]);
  });

  it("reports a malformed line instead of throwing, so one bad record cannot abort an import", async () => {
    const path = writeFixture(
      "malformed.jsonl",
      '{"word":"padre"}\n{"word": [\n{"word":"madre"}\n',
    );
    const lines = await collect(path);
    expect(lines).toHaveLength(3);
    expect(lines[1].parseError).toBe("invalid JSON");
    expect(lines[1].value).toBeNull();
    // The stream keeps going: the record after the bad line still arrives.
    expect(lines[2].value).toEqual({ word: "madre" });
  });

  it("skips blank lines without counting them as records", async () => {
    const path = writeFixture("blanks.jsonl", '{"a":1}\n\n   \n{"a":2}\n');
    const lines = await collect(path);
    expect(lines.map((line) => line.value)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("decompresses a .gz dump in the same stream", async () => {
    const path = writeFixture(
      "compressed.jsonl.gz",
      gzipSync('{"word":"padre"}\n{"word":"madre"}\n'),
    );
    const lines = await collect(path);
    expect(lines.map((line) => line.value)).toEqual([
      { word: "padre" },
      { word: "madre" },
    ]);
  });

  it("handles a file with no trailing newline", async () => {
    const path = writeFixture("no-newline.jsonl", '{"word":"padre"}');
    const lines = await collect(path);
    expect(lines).toHaveLength(1);
  });
});

describe("assertImportFileSize", () => {
  it("returns the size of an acceptable file", () => {
    const path = writeFixture("size.jsonl", '{"a":1}\n');
    expect(assertImportFileSize(path)).toBe(8);
  });

  it("refuses a file beyond the permitted size before any parsing happens", () => {
    const path = writeFixture("too-big.jsonl", '{"a":1}\n');
    expect(() => assertImportFileSize(path, 2)).toThrow(
      /maximum permitted size/,
    );
  });
});
