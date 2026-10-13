"use client";

import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

const FRAME = {
  border: "1px solid var(--border-default)",
  borderRadius: "calc(var(--radius) * 1.4)",
  p: 4,
  textAlign: "center",
} as const;

/**
 * The designed empty state for a level with no groups (ui-context.md
 * "Interface States"). For someone who may add one it is an invitation, with
 * the action right there; for anyone else it says whose job it is, instead of a
 * dead end.
 */
export function GroupsListEmpty({
  levelNumber,
  canCreate,
  onCreate,
}: {
  levelNumber: number | undefined;
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <Box sx={FRAME}>
      <Typography sx={{ fontWeight: 500 }}>
        No vocabulary groups yet
        {levelNumber === undefined ? "" : ` in Level ${levelNumber}`}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
        {canCreate
          ? "Add the first group. Each new group is added after the ones already there, as the next lesson."
          : "An Admin adds groups."}
      </Typography>
      {canCreate ? (
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={onCreate}>
            Add group
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * A language with no levels has no groups to show — groups live inside a level.
 * Points at where levels are made (an Admin's job) rather than ending there.
 */
export function GroupsNoLevels({ levelsHref }: { levelsHref: string }) {
  return (
    <Box sx={FRAME}>
      <Typography sx={{ fontWeight: 500 }}>
        No levels yet for this language
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
        Groups belong to a level. Create a level first, then add groups to it.
      </Typography>
      <Box sx={{ mt: 2 }}>
        <Button variant="outlined" component={NextLink} href={levelsHref}>
          Go to Levels
        </Button>
      </Box>
    </Box>
  );
}
