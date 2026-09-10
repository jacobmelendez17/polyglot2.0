import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PronunciationButton } from "@/components/shared/pronunciation-button";

/**
 * jsdom implements neither `speechSynthesis` nor media playback, which is
 * exactly the "browser cannot pronounce this" case the component has to
 * handle — so the unsupported path is the default here and the supported one
 * is stubbed in.
 */
function stubSpeechSynthesis() {
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal("speechSynthesis", { speak, cancel, getVoices: () => [] });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      lang = "";
      rate = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    },
  );
  return { speak, cancel };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PronunciationButton", () => {
  it("speaks the target text in the item's language when synthesis is available", async () => {
    const { speak } = stubSpeechSynthesis();
    const user = userEvent.setup();
    render(<PronunciationButton text="el gato" languageCode="es-MX" />);

    await user.click(screen.getByRole("button", { name: "Play pronunciation of el gato" }));

    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as { text: string; lang: string };
    expect(utterance.text).toBe("el gato");
    expect(utterance.lang).toBe("es-MX");
  });

  it("names what it will pronounce, so several buttons on a page stay distinguishable", () => {
    stubSpeechSynthesis();
    render(<PronunciationButton text="El gato duerme." languageCode="es-MX" label="El gato duerme." />);

    expect(screen.getByRole("button", { name: "Play pronunciation of El gato duerme." })).toBeInTheDocument();
  });

  it("disables itself with a stated reason when the browser cannot pronounce anything", () => {
    render(<PronunciationButton text="el gato" languageCode="es-MX" />);

    const button = screen.getByRole("button", { name: "Pronunciation of el gato is unavailable in this browser" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "This browser cannot play pronunciation audio.");
  });

  it("stays available on a synthesis-less browser when the item has a real recording", () => {
    render(<PronunciationButton text="el gato" languageCode="es-MX" audioUrl="https://example.invalid/gato.ogg" />);

    expect(screen.getByRole("button", { name: "Play pronunciation of el gato" })).toBeEnabled();
  });
});
