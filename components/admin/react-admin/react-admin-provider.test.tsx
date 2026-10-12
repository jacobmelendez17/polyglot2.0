import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useNavigate } from "react-router";
import { describe, expect, it } from "vitest";

import { ReactAdminProvider } from "./react-admin-provider";

function GoSomewhere() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/somewhere/else")}>
      go
    </button>
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

    // A router *is* present (React Admin requires one) …
    await user.click(screen.getByRole("button", { name: "go" }));

    // … but navigating through it must not touch the real URL. A default
    // HashRouter would have turned this into `/admin#/somewhere/else`.
    expect(window.location.pathname).toBe("/admin");
    expect(window.location.hash).toBe("");
  });
});
