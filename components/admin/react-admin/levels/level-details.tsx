"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";

import { describeLevelContents, type LevelFields } from "./level-edit-model";

/**
 * A level's metadata, read-only — what someone who may see a level but not
 * change it (a writer; spec 26 §6: structural mutations are Admin-only) gets in
 * place of the form. The server refuses their changes regardless; this just
 * does not offer what would only ever be refused.
 */
export function LevelDetails({
  fields,
  counts,
}: {
  fields: LevelFields;
  counts: {
    vocabularyItems: number;
    grammarItems: number;
    vocabularyGroups: number;
  };
}) {
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
          {fields.name ?? "—"}
        </Typography>

        <Typography component="dt" variant="body2" color="text.secondary">
          CEFR band
        </Typography>
        <Typography component="dd" variant="body2" sx={{ m: 0 }}>
          {fields.cefrLevel ?? "Not set"}
        </Typography>

        <Typography component="dt" variant="body2" color="text.secondary">
          Status
        </Typography>
        <Box component="dd" sx={{ m: 0 }}>
          <CurriculumStatusBadge status={fields.status} />
        </Box>
      </Box>

      <Typography variant="body2" sx={{ color: "text.secondary", mt: 2 }}>
        {describeLevelContents(counts)}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
        An Admin edits level properties.
      </Typography>
    </Box>
  );
}
