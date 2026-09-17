import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AdminAuditEvent } from "@/domains/admin";

import { AuditLogTable } from "./audit-log-table";

function event(overrides: Partial<AdminAuditEvent> = {}): AdminAuditEvent {
  return {
    id: "event-1",
    actorUserId: "60000000-0000-0000-0000-000000000002",
    action: "CURRICULUM_ITEM_CREATED",
    resourceType: "vocabulary_item",
    resourceId: "40000000-0000-0000-0000-000000000001",
    beforeData: null,
    afterData: { term: "gato" },
    reason: null,
    correlationId: null,
    createdAt: new Date("2026-01-01T12:00:00Z"),
    ...overrides,
  };
}

describe("AuditLogTable", () => {
  it("renders each event's resolved actor name, action, resource, and reason", () => {
    render(
      <AuditLogTable
        events={[event({ reason: "Better thematic fit" })]}
        actorNamesById={{ "60000000-0000-0000-0000-000000000002": "Dev Admin" }}
      />,
    );

    expect(screen.getByText("Dev Admin")).toBeInTheDocument();
    expect(screen.getByText("CURRICULUM_ITEM_CREATED")).toBeInTheDocument();
    expect(screen.getByText("vocabulary_item")).toBeInTheDocument();
    expect(screen.getByText("Better thematic fit")).toBeInTheDocument();
  });

  it("falls back to a shortened ID when the actor can't be resolved to a name", () => {
    render(<AuditLogTable events={[event()]} actorNamesById={{}} />);
    expect(screen.getByText("60000000…")).toBeInTheDocument();
  });

  it("shows a designed empty state, not a blank table, when nothing matches", () => {
    render(<AuditLogTable events={[]} actorNamesById={{}} />);
    expect(
      screen.getByText("No audit events match these filters."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("expands and collapses a row's before/after detail on demand", async () => {
    const user = userEvent.setup();
    render(
      <AuditLogTable
        events={[event({ afterData: { term: "gato" } })]}
        actorNamesById={{}}
      />,
    );

    expect(screen.queryByText(/"term"/)).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Show details" });
    await user.click(toggle);
    expect(screen.getByText(/"term": "gato"/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.queryByText(/"term"/)).not.toBeInTheDocument();
  });

  it("shows no expand toggle when there's no before/after data to show", () => {
    render(
      <AuditLogTable
        events={[event({ beforeData: null, afterData: null })]}
        actorNamesById={{}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Show details" }),
    ).not.toBeInTheDocument();
  });
});
