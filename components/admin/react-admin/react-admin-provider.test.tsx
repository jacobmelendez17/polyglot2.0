import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouterProvider } from "react-admin";
import { useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ReactAdminProvider } from "./react-admin-provider";

/**
 * Navigates through *React Admin's own* router hooks — what `useListParams`,
 * `useRedirect`, and every RA component use — not through a router API the
 * test imports itself. That distinction is the whole point: Unit 1's version
 * of this test navigated via `react-router` directly and so could not notice
 * that React Admin was not using this provider's router at all.
 */
function GoSomewhere() {
  const navigate = useRouterProvider().useNavigate();
  const location = useRouterProvider().useLocation();
  const rrLocation = useLocation();
  return (
    <>
      <button type="button" onClick={() => navigate({ search: "?page=2" })}>
        go
      </button>
      <output aria-label="ra-location">{location.search}</output>
      <output aria-label="provider-router-location">{rrLocation.search}</output>
    </>
  );
}

describe("ReactAdminProvider — routing containment", () => {
  it("never writes to the address bar: React Admin's router is not the page's router", async () => {
    window.history.replaceState(null, "", "/admin");
    const user = userEvent.setup();
    render(
      <ReactAdminProvider signInPath="/sign-in">
        <GoSomewhere />
      </ReactAdminProvider>,
    );

    await user.click(screen.getByRole("button", { name: "go" }));

    // React Admin navigated, and it did so in *this provider's* router …
    expect(screen.getByLabelText("ra-location")).toHaveTextContent("?page=2");
    expect(screen.getByLabelText("provider-router-location")).toHaveTextContent(
      "?page=2",
    );
    // … so the real URL is untouched. A second, HashRouter-based router would
    // have turned this into `/admin#/?page=2`.
    expect(window.location.pathname).toBe("/admin");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });
});
