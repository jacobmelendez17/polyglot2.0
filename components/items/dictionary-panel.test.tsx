import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DictionaryPanel } from "@/components/items/dictionary-panel";

describe("DictionaryPanel", () => {
  it("renders senses, pronunciation, forms, variants, synonyms, regional evidence, and attribution", () => {
    render(
      <DictionaryPanel
        lemma="gato"
        selectedSenses={[{ id: "sense-1", senseOrder: 0, gloss: "a domestic cat", tags: ["informal"], topics: [], sourceStatus: "active" }]}
        pronunciations={[{ id: "pron-1", ipa: "/ˈɡa.to/", regionCode: "MX", tags: [], audioUrl: null, sourceStatus: "active" }]}
        preferredPronunciationId="pron-1"
        forms={[{ id: "form-1", form: "gatos", tags: ["plural"], sourceStatus: "active" }]}
        synonyms={["minino"]}
        variants={["gatico"]}
        regionalEvidence={[{ regionCode: "MX", status: "not_listed", matchedForm: null, evaluatedAt: new Date("2026-01-01T00:00:00.000Z") }]}
        attribution={{ sourceCode: "wiktionary_es", provider: "Wiktionary", attributionText: "Definitions from Wiktionary, CC BY-SA 4.0", sourceVersion: "2026-01" }}
      />,
    );

    expect(screen.getByText("Dictionary information")).toBeInTheDocument();
    expect(screen.getByText(/a domestic cat/)).toBeInTheDocument();
    expect(screen.getByText("/ˈɡa.to/")).toBeInTheDocument();
    expect(screen.getByText(/gatos/)).toBeInTheDocument();
    expect(screen.getByText("gatico")).toBeInTheDocument();
    expect(screen.getByText("minino")).toBeInTheDocument();
    expect(screen.getByText(/Not listed/)).toBeInTheDocument();
    expect(screen.getByText(/Absence is weak evidence/)).toBeInTheDocument();
    expect(screen.getByText(/Wiktionary, CC BY-SA 4.0/)).toBeInTheDocument();
  });

  it("omits every optional section when the entry has no data for it", () => {
    render(
      <DictionaryPanel
        lemma="palabra"
        selectedSenses={[]}
        pronunciations={[]}
        preferredPronunciationId={null}
        forms={[]}
        synonyms={[]}
        variants={[]}
        regionalEvidence={[]}
        attribution={null}
      />,
    );

    expect(screen.queryByText("Senses")).not.toBeInTheDocument();
    expect(screen.queryByText("Forms & variants")).not.toBeInTheDocument();
    expect(screen.queryByText("Synonyms")).not.toBeInTheDocument();
    expect(screen.queryByText("Regional usage")).not.toBeInTheDocument();
  });
});
