"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";

import type { GroupFields } from "./group-edit-model";

/**
 * A group's metadata, read-only — what someone who may see a group but not
 * change it (a writer; spec 26 §6: structural mutations are Admin-only) gets in
 * place of the form. The server refuses their changes regardless; this just
 * does not offer what would only ever be refused.
 */
export function GroupDetails({ fields }: { fields: GroupFields }) {
  return (
    <Box sx={{ maxWidth: 560 }}>
      <Box
        component="dl"
        sx={{ m: 0, display: "grid", gap: 1, gridTemplateColumns: "8rem 1fr" }}
      >
        <Typography component="dt" variant="body2" color="text.secondary">
          Name
        </Typography>
        <Typography component="dd" variant="body2" sx={{ m: 0 }}>
          {fields.name}
        </Typography>

        <Typography component="dt" variant="body2" color="text.secondary">
          Status
        </Typography>
        <Box component="dd" sx={{ m: 0 }}>
          <CurriculumStatusBadge status={fields.status} />
        </Box>
      </Box>

      <Typography variant="body2" sx={{ color: "text.secondary", mt: 2 }}>
        An Admin edits group properties.
      </Typography>
    </Box>
  );
}
