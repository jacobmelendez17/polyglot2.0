import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CurriculumStatusBadge } from "./curriculum-status-badge";

describe("CurriculumStatusBadge", () => {
  it.each([
    ["draft", "Draft"],
    ["pending", "Pending"],
    ["published", "Published"],
    ["archived", "Archived"],
  ] as const)(
    "renders the %s status with a visible text label, not color alone",
    (status, label) => {
      render(<CurriculumStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );
});
