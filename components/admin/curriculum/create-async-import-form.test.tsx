import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/app/(admin)/admin/curriculum/async-import-actions", () => ({
  createAsyncCurriculumImportAction: create,
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { CreateAsyncImportForm } from "./create-async-import-form";

const GOOD = "word,translation,level,group\ngato,cat,1,1\n";

/** jsdom's `File` has no `text()` / `slice().text()`; this one reads like a browser's. */
function file(name: string, content: string) {
  const f = new File([content], name);
  Object.defineProperty(f, "slice", {
    value: () => ({ text: () => Promise.resolve(content) }),
  });
  return f;
}

function choose(f: File) {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [f] } });
}

beforeEach(() => {
  create.mockReset();
  push.mockReset();
  vi.unstubAllGlobals();
});

describe("CreateAsyncImportForm — says what to fix", () => {
  it("refuses a file that is not .csv or .tsv", async () => {
    render(<CreateAsyncImportForm languageId="lang-1" />);
    choose(file("notes.xlsx", GOOD));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a .csv or .tsv file.",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("names the missing columns before anything is created or uploaded", async () => {
    render(<CreateAsyncImportForm languageId="lang-1" />);
    choose(file("level-2.csv", "word,meaning\ngato,cat\n"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /missing the required columns: translation, level, group/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("shows the server's own explanation when the import cannot be created", async () => {
    create.mockResolvedValue({
      ok: false,
      error: {
        code: "IMPORTS_NOT_CONFIGURED",
        message: "Imports aren't set up in this environment yet: IMPORT_BUCKET",
      },
    });
    render(<CreateAsyncImportForm languageId="lang-1" />);
    choose(file("level-2.csv", GOOD));
    expect(await screen.findByRole("alert")).toHaveTextContent(/IMPORT_BUCKET/);
  });

  it("explains a refusal from storage by its code, not just 'the upload failed'", async () => {
    create.mockResolvedValue({
      ok: true,
      data: { importId: "imp-1", uploadUrl: "https://bucket.invalid/put" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("<Error><Code>AccessDenied</Code></Error>"),
      }),
    );
    render(<CreateAsyncImportForm languageId="lang-1" />);
    choose(file("level-2.csv", GOOD));
    expect(await screen.findByRole("alert")).toHaveTextContent(/AccessDenied/);
    expect(push).not.toHaveBeenCalled();
  });

  it("blames CORS or the connection when the upload never gets an answer", async () => {
    create.mockResolvedValue({
      ok: true,
      data: { importId: "imp-1", uploadUrl: "https://bucket.invalid/put" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    render(<CreateAsyncImportForm languageId="lang-1" />);
    choose(file("level-2.csv", GOOD));
    expect(await screen.findByRole("alert")).toHaveTextContent(/CORS/);
  });

  it("opens the import's page once the file is uploaded", async () => {
    create.mockResolvedValue({
      ok: true,
      data: { importId: "imp-1", uploadUrl: "https://bucket.invalid/put" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    render(<CreateAsyncImportForm languageId="lang-1" />);
    choose(file("level-2.csv", GOOD));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/admin/curriculum/imports/imp-1"),
    );
  });
});
