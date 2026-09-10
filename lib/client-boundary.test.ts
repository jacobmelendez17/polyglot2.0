import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A `"use client"` module's non-component exports may not be *called* from a
 * server component — only rendered as a component, or passed as props. Next
 * enforces that at render time, so neither `tsc` nor `next build` catches a
 * violation: the page compiles, deploys, and throws the moment somebody opens
 * it.
 *
 * That is exactly how it reached a real page once (2026-09-09, spec 18 unit
 * 5): `toRegisterEditorValue` lived in `register-select.tsx` alongside the
 * control that uses it, and two server components called it. Every automated
 * check passed; the item page threw on load.
 *
 * So this test walks the import graph instead. It is deliberately about
 * *callable* exports — a type import is erased, and a component import is the
 * supported case.
 */

const ROOTS = ["app", "components", "domains", "lib", "providers"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

function sourceFiles(directory: string): string[] {
  const absolute = path.join(PROJECT_ROOT, directory);
  const found: string[] = [];
  for (const entry of readdirSync(absolute)) {
    const full = path.join(absolute, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(path.join(directory, entry)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      found.push(full);
    }
  }
  return found;
}

/** The directive only counts as one when it is the module's first statement, not when it appears in a comment about the rule. */
function isClientModule(contents: string): boolean {
  const firstLine = contents.trimStart().split("\n")[0] ?? "";
  return /^["']use client["'];?$/.test(firstLine.trim());
}

/** Exported functions/consts whose names start lowercase — i.e. not React components. Types are ignored: `export type` is erased at build time. */
function callableExports(contents: string): Set<string> {
  const names = new Set<string>();
  for (const match of contents.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+([a-z][A-Za-z0-9_]*)/gm)) {
    names.add(match[1]!);
  }
  return names;
}

/** Resolves a relative or `@/`-aliased specifier to the file it names, trying the extensions and index forms TypeScript would. */
function resolveImport(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(PROJECT_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromFile), specifier)
      : null;
  if (!base) return null;

  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this candidate; try the next form.
    }
  }
  return null;
}

type Violation = { importer: string; clientModule: string; imported: string[] };

function findViolations(): Violation[] {
  const files = ROOTS.flatMap(sourceFiles);
  const contentsByFile = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const violations: Violation[] = [];

  for (const [file, contents] of contentsByFile) {
    if (isClientModule(contents)) continue;

    // Named value imports only. `import type { … }` is erased, and so is a
    // `type` specifier inside a mixed import, so both are stripped first.
    for (const match of contents.matchAll(/^import\s+(?!type\s)\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm)) {
      const target = resolveImport(file, match[2]!);
      if (!target) continue;

      const targetContents = contentsByFile.get(target);
      if (!targetContents || !isClientModule(targetContents)) continue;

      const exported = callableExports(targetContents);
      const imported = match[1]!
        .split(",")
        .map((specifier) => specifier.trim().split(/\s+as\s+/)[0]!.trim())
        .filter((name) => name.length > 0 && !name.startsWith("type ") && exported.has(name));

      if (imported.length > 0) {
        violations.push({
          importer: path.relative(PROJECT_ROOT, file),
          clientModule: path.relative(PROJECT_ROOT, target),
          imported,
        });
      }
    }
  }

  return violations;
}

describe("client/server boundary", () => {
  it("never calls a client module's non-component export from a module that may run on the server", () => {
    const violations = findViolations();

    // Reported as readable lines rather than a bare count: the fix is always
    // "move that helper into a plain module beside the client component", and
    // the message should say which helper and where.
    expect(
      violations.map((violation) => `${violation.importer} imports ${violation.imported.join(", ")} from "use client" module ${violation.clientModule}`),
    ).toEqual([]);
  });
});
