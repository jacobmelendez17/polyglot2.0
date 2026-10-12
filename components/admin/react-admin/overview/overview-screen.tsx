"use client";

import { useEffect } from "react";
import NextLink from "next/link";
import { useGetOne, useNotify } from "react-admin";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";

import {
  ADMIN_OVERVIEW_RECORD_ID,
  type AdminCurriculumStatusCounts,
  type AdminOverview,
  type AdminPermissions,
} from "@/domains/admin";

import { describeAdminError } from "../admin-api-error";
import { useAdminPermissions } from "../use-admin-permissions";
import { getOverviewLinks } from "./overview-links";
import { OverviewSkeleton } from "./overview-skeleton";

const STAT_LABELS: ReadonlyArray<{
  key: keyof AdminCurriculumStatusCounts;
  label: string;
}> = [
  { key: "published", label: "Published" },
  { key: "pending", label: "Pending" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
];

/** Same height as `OverviewSkeleton`'s blocks, so data arriving shifts nothing. */
const CARD_MIN_HEIGHT = "5.25rem";

const FOCUS_RING = {
  "&:focus-visible": { outline: "2px solid var(--ring)", outlineOffset: -2 },
};

function StatCards({ counts }: { counts: AdminCurriculumStatusCounts }) {
  return (
    <Box
      component="dl"
      aria-label="Curriculum status counts"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
        gap: 1.5,
        m: 0,
        mb: 2,
      }}
    >
      {STAT_LABELS.map(({ key, label }) => (
        // Label first in the DOM (so a screen reader says "Published, 12"),
        // number first on screen — the layout the Overview has always had.
        <Card
          key={key}
          component="div"
          sx={{
            p: 2,
            minHeight: CARD_MIN_HEIGHT,
            display: "flex",
            flexDirection: "column-reverse",
            justifyContent: "flex-end",
          }}
        >
          <Typography
            component="dt"
            variant="body2"
            sx={{ color: "text.secondary" }}
          >
            {label}
          </Typography>
          <Typography
            component="dd"
            sx={{ m: 0, fontSize: "1.5rem", fontWeight: 600 }}
          >
            {counts[key]}
          </Typography>
        </Card>
      ))}
    </Box>
  );
}

function ShortcutCards({
  permissions,
}: {
  permissions: Pick<
    AdminPermissions,
    "canManageCurriculum" | "canUseDeveloperTools"
  >;
}) {
  const links = getOverviewLinks(permissions);
  if (links.length === 0) return null;

  return (
    <Box
      component="ul"
      aria-label="Admin shortcuts"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
        gap: 1.5,
        listStyle: "none",
        m: 0,
        p: 0,
      }}
    >
      {links.map((link) => (
        <li key={link.href}>
          <Card sx={{ height: "100%" }}>
            <CardActionArea
              component={NextLink}
              href={link.href}
              sx={{ p: 2, minHeight: CARD_MIN_HEIGHT, ...FOCUS_RING }}
            >
              <Typography sx={{ fontWeight: 500 }}>{link.label}</Typography>
              <Typography
                variant="body2"
                sx={{ mt: 0.5, color: "text.secondary" }}
              >
                {link.description}
              </Typography>
            </CardActionArea>
          </Card>
        </li>
      ))}
    </Box>
  );
}

function OverviewProblem({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { kind, message, retryable } = describeAdminError(error);

  if (kind === "unauthenticated") {
    // The auth provider has already sent the browser to Clerk's sign-in
    // page; this is only what shows during that hand-off.
    return (
      <Alert severity="info" role="status">
        {message}
      </Alert>
    );
  }

  if (kind === "forbidden") {
    // Permanent: offer a way out rather than a retry (ui-context.md Error).
    return (
      <Alert
        severity="warning"
        action={
          <Button
            color="inherit"
            size="small"
            component={NextLink}
            href="/dashboard"
          >
            Back to dashboard
          </Button>
        }
      >
        {message}
      </Alert>
    );
  }

  return (
    <Alert
      severity="error"
      action={
        retryable ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}

/**
 * The failure, if any, that must replace the screen. A transient failure
 * (network, 5xx) leaves already-loaded data in place so the person can keep
 * reading while a warning shows. A *denial* never does: if the server now
 * says 401/403, whatever privileged data is still in the cache must go
 * (spec 26 §8: "on 401/403 clear stale privileged UI").
 */
function blockingError(error: unknown, hasData: boolean): unknown {
  if (!error) return null;
  const { kind } = describeAdminError(error);
  const isDenial = kind === "forbidden" || kind === "unauthenticated";
  return !hasData || isDenial ? error : null;
}

/**
 * The Admin Overview, driven by React Admin's data layer (spec 26 Unit 1):
 * `useGetOne` fetches the `overview` resource through the typed
 * `dataProvider`, `useAdminPermissions` mirrors the server's own permission
 * answer, and `useNotify` reports a *background* refresh that failed while
 * stale data is still on screen. The page's heading and the server-side role
 * guard stay in `app/(admin)/admin`.
 *
 * What each role sees is decided by the server (`/overview` returns
 * `curriculum: null` to anyone who may not see counts; `/me` says which
 * shortcuts apply) — this component only renders it.
 */
export function OverviewScreen() {
  const notify = useNotify();
  const overview = useGetOne<AdminOverview>("overview", {
    id: ADMIN_OVERVIEW_RECORD_ID,
  });
  const permissions = useAdminPermissions();

  const overviewError = blockingError(overview.error, Boolean(overview.data));
  const permissionsError = blockingError(
    permissions.error,
    Boolean(permissions.permissions),
  );

  // A background refresh that failed transiently while data is still on
  // screen: keep the data, say so. (A denial replaces the screen instead.)
  const refreshFailed = overview.isRefetchError && !overviewError;
  const refreshError = overview.error;
  useEffect(() => {
    if (refreshFailed) {
      notify(describeAdminError(refreshError).message, { type: "warning" });
    }
  }, [refreshFailed, refreshError, notify]);

  if (overviewError) {
    return (
      <OverviewProblem
        error={overviewError}
        onRetry={() => void overview.refetch()}
      />
    );
  }
  if (permissionsError) {
    return (
      <OverviewProblem
        error={permissionsError}
        onRetry={() => void permissions.refetch()}
      />
    );
  }

  if (!overview.data || !permissions.permissions) {
    return <OverviewSkeleton />;
  }

  const counts = overview.data.curriculum;
  const links = getOverviewLinks(permissions.permissions);
  if (!counts && links.length === 0) {
    return (
      <Alert severity="info">
        Nothing is available to your account in the admin console yet.
      </Alert>
    );
  }

  return (
    <>
      {counts ? <StatCards counts={counts} /> : null}
      <ShortcutCards permissions={permissions.permissions} />
    </>
  );
}
