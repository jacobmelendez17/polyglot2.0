import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LanguageChoiceView } from "./language-choice-view";
import { setActiveLanguageAction } from "@/app/(onboarding)/onboarding/language/actions";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("@/app/(onboarding)/onboarding/language/actions", () => ({
  setActiveLanguageAction: vi.fn(),
}));

const mockSetActiveLanguageAction = vi.mocked(setActiveLanguageAction);

const LANGUAGES = [
  { id: "lang-es", code: "es-MX", slug: "spanish", name: "Spanish" },
  { id: "lang-fr", code: "fr-FR", slug: "french", name: "French" },
];

beforeEach(() => {
  mockReplace.mockReset();
  mockSetActiveLanguageAction.mockReset();
});

describe("LanguageChoiceView", () => {
  it("lists every language it is given, so a second language needs no code change", () => {
    render(<LanguageChoiceView languages={LANGUAGES} continueHref="/next" />);

    expect(screen.getByRole("radio", { name: "Spanish" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "French" })).toBeInTheDocument();
  });

  it("keeps Continue disabled until a language is chosen when none is preselected", async () => {
    const user = userEvent.setup();
    render(<LanguageChoiceView languages={LANGUAGES} continueHref="/next" />);

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "Spanish" }));
    expect(continueButton).toBeEnabled();
  });

  it("preselects the learner's current language when revisiting", () => {
    render(
      <LanguageChoiceView
        languages={LANGUAGES}
        initialLanguageId="lang-fr"
        continueHref="/next"
      />,
    );

    expect(screen.getByRole("radio", { name: "French" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("saves the choice, then continues, in a real run", async () => {
    mockSetActiveLanguageAction.mockResolvedValueOnce({ ok: true, data: null });
    const user = userEvent.setup();
    render(
      <LanguageChoiceView
        languages={LANGUAGES}
        initialLanguageId="lang-es"
        continueHref="/onboarding/curriculum"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/onboarding/curriculum"),
    );
    expect(mockSetActiveLanguageAction).toHaveBeenCalledWith({
      languageId: "lang-es",
    });
  });

  it("stays put and shows the error when saving fails", async () => {
    mockSetActiveLanguageAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN", message: "Something went wrong." },
    });
    const user = userEvent.setup();
    render(
      <LanguageChoiceView
        languages={LANGUAGES}
        initialLanguageId="lang-es"
        continueHref="/onboarding/curriculum"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong.",
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("a preview writes nothing and just moves on to the next screen's preview", async () => {
    const user = userEvent.setup();
    render(
      <LanguageChoiceView
        languages={LANGUAGES}
        initialLanguageId="lang-es"
        continueHref="/onboarding/curriculum?replay=1"
        isPreview
      />,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(mockReplace).toHaveBeenCalledWith("/onboarding/curriculum?replay=1");
    expect(mockSetActiveLanguageAction).not.toHaveBeenCalled();
  });
});
