"use client";

import { FormDataConsumer } from "react-admin";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import type { UserRole } from "@/domains/users";
import { USER_ROLES } from "@/domains/users";

import { ROLE_LABELS, ROLE_SUMMARIES, roleChangeImpact } from "./role-model";

const isRole = (value: unknown): value is UserRole =>
  USER_ROLES.some((role) => role === value);

function List({ items }: { items: string[] }) {
  return (
    // Bullets are restated: the app's CSS reset removes list markers, and
    // without them a list of things someone gains or loses reads as one block.
    <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, listStyleType: "disc" }}>
      {items.map((item) => (
        <Typography key={item} component="li" variant="body2">
          {item}
        </Typography>
      ))}
    </Box>
  );
}

/**
 * What the role being chosen would change, written out before anything is sent
 * (spec 26 §6: "show the impact and confirm the change"). It follows the form
 * live, and is a polite live region, so a screen-reader user hears it change as
 * they move through the choices.
 *
 * Gains and losses come from the spec's role matrix (`role-model.ts`), so the
 * dialog can only promise what the product gives. A change that takes access
 * away is a warning, not a footnote.
 */
export function RoleImpact({
  current,
  person,
}: {
  current: UserRole;
  /** How to refer to them in a sentence. */
  person: string;
}) {
  return (
    <Box aria-live="polite" sx={{ mt: 0.5, mb: 1.5 }}>
      <FormDataConsumer<{ role?: unknown }>>
        {({ formData }) => {
          const chosen = isRole(formData.role) ? formData.role : current;
          if (chosen === current) {
            return (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Choose the role {person} should have.
              </Typography>
            );
          }
          const { gains, losses } = roleChangeImpact(current, chosen);
          return (
            <>
              <Typography variant="body2">{ROLE_SUMMARIES[chosen]}</Typography>
              {gains.length > 0 ? (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {person} will be able to:
                  </Typography>
                  <List items={gains} />
                </Box>
              ) : null}
              {losses.length > 0 ? (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {person} will no longer be able to:
                  </Typography>
                  <List items={losses} />
                </Alert>
              ) : null}
              <Typography
                variant="caption"
                sx={{ display: "block", mt: 1, color: "text.secondary" }}
              >
                {ROLE_LABELS[current]} → {ROLE_LABELS[chosen]}. Takes effect on
                their next request. Their progress and settings are not touched.
              </Typography>
            </>
          );
        }}
      </FormDataConsumer>
    </Box>
  );
}
