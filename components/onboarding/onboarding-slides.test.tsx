import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OnboardingSlides } from "./onboarding-slides";
import type { SpeechProvider } from "./lib/speech";

// jsdom has none of these. Reduced motion is on so every move is the 200ms
// crossfade — the same navigation logic, without waiting out the long slides.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement["getContext"];
});

afterEach(() => vi.restoreAllMocks());

const TITLES = [
  "Establish a foundation",
  "Immerse yourself",
  "Customization",
  "Have fun!",
];

const heading = (name: string) =>
  screen.findByRole("heading", { level: 1, name });

/** Navigation locks while a transition runs (crossfade = 200ms + 40ms). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 280));

async function goTo(user: ReturnType<typeof userEvent.setup>, slide: number) {
  for (let i = 0; i < slide; i++) {
    await user.click(screen.getByRole("button", { name: "Next" }));
    await heading(TITLES[i + 1]!);
    await settle();
  }
}

function fakeSpeech(): SpeechProvider & { speak: ReturnType<typeof vi.fn> } {
  return {
    speak: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(),
  } as unknown as SpeechProvider & { speak: ReturnType<typeof vi.fn> };
}

describe("OnboardingSlides", () => {
  it("starts on slide 1 with Back disabled and the approved copy", async () => {
    render(<OnboardingSlides onFinish={() => {}} />);

    expect(await heading("Establish a foundation")).toBeInTheDocument();
    expect(
      screen.getByText(/build a foundation of vocabulary and grammar/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("walks through all four slides with Next, and hides Next and Skip on the last", async () => {
    const user = userEvent.setup();
    render(<OnboardingSlides onFinish={() => {}} />);

    await goTo(user, 3);

    expect(await heading("Have fun!")).toBeInTheDocument();
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("always shows the customization copy alongside the controls", async () => {
    const user = userEvent.setup();
    render(<OnboardingSlides onFinish={() => {}} />);

    await goTo(user, 2);

    expect(
      screen.getByText(/flexibility to learn at your pace and preference/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Particle settings" }),
    ).toBeInTheDocument();
  });

  it("navigates with the arrow keys, and Back returns", async () => {
    const user = userEvent.setup();
    render(<OnboardingSlides onFinish={() => {}} />);

    await user.keyboard("{ArrowRight}");
    await heading("Immerse yourself");
    await settle();
    await user.keyboard("{ArrowLeft}");
    await heading("Establish a foundation");
  });

  it("Skip jumps to the last slide without finishing", async () => {
    const onFinish = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingSlides onFinish={onFinish} />);

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(await heading("Have fun!")).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("finishes only from the Start learning button", async () => {
    const onFinish = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingSlides onFinish={onFinish} />);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    await heading("Have fun!");
    await user.click(screen.getByRole("button", { name: "Start learning" }));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("shows a saving state and any completion error on the finale", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OnboardingSlides onFinish={() => {}} isFinishing />,
    );
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await heading("Have fun!");
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();

    rerender(
      <OnboardingSlides onFinish={() => {}} error="Please try again." />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Please try again.");
    expect(
      screen.getByRole("button", { name: "Start learning" }),
    ).toBeEnabled();
  });

  it("speaks each character in its own language", async () => {
    const speech = fakeSpeech();
    const user = userEvent.setup();
    render(<OnboardingSlides onFinish={() => {}} speech={speech} />);
    await goTo(user, 1);

    for (const name of ["Tagalog", "Español", "Français"]) {
      await user.click(
        screen.getByRole("button", { name: new RegExp(`^${name} character`) }),
      );
    }

    expect(speech.speak.mock.calls.map((call) => call[1])).toEqual([
      "tl-PH",
      "es-MX",
      "fr-FR",
    ]);
    expect(speech.speak.mock.calls[0]![0]).toBe(
      "Kumusta! Tara, mag-aral tayo!",
    );
  });

  it("colour listbox: arrows move, Enter selects, Escape closes and returns focus", async () => {
    const user = userEvent.setup();
    render(<OnboardingSlides onFinish={() => {}} />);
    await goTo(user, 2);

    const button = screen.getByRole("button", { name: /Color/ });
    expect(button).toHaveTextContent("Sage");
    button.focus();
    await user.keyboard("{ArrowDown}");
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(button).toHaveTextContent("Clay");
    expect(button).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
    // arrows inside the listbox must not have changed the slide
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
  });

  it("size slider ranges 1–6 in half steps and updates its readout", async () => {
    const user = userEvent.setup();
    render(<OnboardingSlides onFinish={() => {}} />);
    await goTo(user, 2);

    const slider = screen.getByRole("slider", { name: "Size" });
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "6");
    expect(slider).toHaveAttribute("step", "0.5");
    expect(slider).toHaveValue("2.5");

    // jsdom's user-event doesn't implement range keys, so drive the change directly
    fireEvent.change(slider, { target: { value: "4" } });
    expect(slider).toHaveValue("4");
    expect(screen.getByText("4", { selector: "output" })).toBeInTheDocument();
  });

  it("letters switch toggles", async () => {
    const user = userEvent.setup();
    render(<OnboardingSlides onFinish={() => {}} />);
    await goTo(user, 2);

    const toggle = screen.getByRole("switch", {
      name: "Letters from everywhere",
    });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("finale shows ten postcards that flip when pressed", async () => {
    const user = userEvent.setup();
    render(<OnboardingSlides onFinish={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await heading("Have fun!");

    const cards = screen.getAllByRole("button", { name: /^Postcard in/ });
    expect(cards).toHaveLength(10);
    expect(cards[0]).toHaveAttribute("aria-pressed", "false");
    await user.click(cards[0]!);
    expect(cards[0]).toHaveAttribute("aria-pressed", "true");
  });
});
