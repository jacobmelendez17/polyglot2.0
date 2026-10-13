"use client";

import { FormDataConsumer } from "react-admin";
import CheckIcon from "@mui/icons-material/Check";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/**
 * "Saved", beside an edit form's Save button (spec 26 Units 4-5).
 *
 * The region is always in the page, so assistive technology announces its text
 * when it appears; the text is shown only while a save has gone through *and*
 * nothing has been changed since. Typing again takes it away, because it would
 * no longer be true of what is on screen.
 */
export function SavedIndicator<Values extends object>({
  saved,
  differs,
}: {
  /** A save went through since the form last changed (`useEditCommand().saved`). */
  saved: boolean;
  /** Whether the form's current values differ from what is saved (`useEditCommand().differs`). */
  differs: (values: Values) => boolean;
}) {
  return (
    <Box role="status" aria-live="polite">
      <FormDataConsumer<Values>>
        {({ formData }) =>
          saved && !differs(formData) ? (
            <Typography
              variant="body2"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                color: "success.main",
              }}
            >
              <CheckIcon fontSize="small" aria-hidden="true" />
              Saved
            </Typography>
          ) : null
        }
      </FormDataConsumer>
    </Box>
  );
}
