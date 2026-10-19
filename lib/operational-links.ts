/**
 * Spec 27 Unit 27.10 — where the Admin console's links to the owner's own
 * dashboards point, and the rules that make an external link safe to show.
 *
 * The Admin console links out to Grafana Cloud (dashboards, alerts, the uptime
 * check) and to PostHog's dashboards. Those addresses belong to the owner's
 * accounts, so they are settings — but a setting that becomes an `href` is a
 * place for a mistake or a hostile value to turn into a link an administrator
 * clicks. So nothing here is trusted as typed:
 *
 * - **https only, with nothing else in the address.** No credentials, no port,
 *   no query string, no fragment. A shared-dashboard link is a secret in a URL
 *   (anyone holding it can read the dashboard), so a path that names PostHog's
 *   `shared`, `embedded` or `exporter` routes is refused too.
 * - **The vendor's own hosts, and nothing else.** A Grafana Cloud stack is
 *   `<stack>.grafana.net` — exactly one label, so `grafana.net.evil.example`,
 *   `evil.grafana.net.example` and look-alike spellings (which the address
 *   parser turns into `xn--…`) never match. PostHog Cloud is `us.posthog.com`,
 *   `eu.posthog.com` or `app.posthog.com`.
 * - **Grafana links are derived, not typed.** The owner supplies the stack's
 *   address; the paths (`/dashboards`, `/alerting/list`…) are Grafana's own and
 *   fixed here, so a setting cannot point a "Dashboards" link somewhere else on
 *   the stack's domain.
 * - **A rejected setting is reported by name only** and produces no link. The
 *   value never appears in a message: a secret pasted into the wrong variable is
 *   the commonest leak.
 *
 * Total, like `parseTelemetryConfig`: it never throws, so a malformed link
 * setting costs a link, never the application. Pure — it reads only the source it
 * is given — so every rule is unit-testable with a plain object. Nothing here is
 * secret (these are links to pages that ask the visitor to sign in to the
 * vendor), and nothing here is `NEXT_PUBLIC_`: only the server reads the
 * settings, and only people allowed to use developer tools are ever sent a link.
 */

export const OPERATIONAL_LINK_SETTINGS = [
  "GRAFANA_STACK_URL",
  "POSTHOG_DASHBOARDS_URL",
] as const;

export type OperationalLinkSetting = (typeof OPERATIONAL_LINK_SETTINGS)[number];

export type OperationalLink = {
  readonly label: string;
  readonly url: string;
};

export type OperationalLinks = {
  /** Present only when `GRAFANA_STACK_URL` is set and valid. */
  readonly grafana: {
    readonly stack: string;
    readonly links: readonly OperationalLink[];
  } | null;
  /** Present only when `POSTHOG_DASHBOARDS_URL` is set and valid. */
  readonly posthog: {
    /** The dashboards address the owner configured: what the "Analytics" link opens. */
    readonly dashboards: string;
    readonly links: readonly OperationalLink[];
  } | null;
  /** Settings that were set but not accepted — names only, never values. */
  readonly rejected: readonly OperationalLinkSetting[];
};

export type OperationalLinksSource = Readonly<
  Record<string, string | undefined>
>;

/** What an address must look like to be shown at all. Null means "not acceptable". */
function parseCleanHttpsUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const clean =
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.search === "" &&
    url.hash === "";
  return clean ? url : null;
}

// Exactly one DNS label before `.grafana.net`: a stack name. An internationalised
// name (which the address parser spells `xn--…`) is not a stack name.
const GRAFANA_STACK_HOST =
  /^(?!xn--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.grafana\.net$/;

function grafanaLinks(origin: string): OperationalLink[] {
  return [
    { label: "Dashboards", url: `${origin}/dashboards` },
    { label: "Alert rules", url: `${origin}/alerting/list` },
    // Where an email address is added as the place alerts are sent.
    { label: "Email contact points", url: `${origin}/alerting/notifications` },
    { label: "Explore metrics, traces and logs", url: `${origin}/explore` },
    {
      label: "Uptime check (Synthetic Monitoring)",
      url: `${origin}/a/grafana-synthetic-monitoring-app/home`,
    },
  ];
}

function parseGrafana(raw: string): OperationalLinks["grafana"] | undefined {
  const url = parseCleanHttpsUrl(raw);
  if (!url) return undefined;
  if (url.pathname !== "/" || !GRAFANA_STACK_HOST.test(url.hostname)) {
    return undefined;
  }
  const stack = `https://${url.hostname}`;
  return { stack, links: grafanaLinks(stack) };
}

const POSTHOG_APP_HOSTS: ReadonlySet<string> = new Set([
  "us.posthog.com",
  "eu.posthog.com",
  "app.posthog.com",
]);

// Letters, digits, `/`, `_` and `-` only, and not absurdly long.
const POSTHOG_SAFE_PATH = /^\/[A-Za-z0-9/_-]{0,199}$/;
// PostHog routes whose path carries an access token: anyone with the link can
// read what it shows.
const POSTHOG_TOKEN_ROUTES: ReadonlySet<string> = new Set([
  "shared",
  "embedded",
  "exporter",
]);

function parsePostHog(raw: string): OperationalLinks["posthog"] | undefined {
  const url = parseCleanHttpsUrl(raw);
  if (!url || !POSTHOG_APP_HOSTS.has(url.hostname)) return undefined;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!POSTHOG_SAFE_PATH.test(path) || path.includes("//")) return undefined;
  const segments = path.split("/").filter(Boolean);
  if (segments.some((segment) => POSTHOG_TOKEN_ROUTES.has(segment))) {
    return undefined;
  }
  const origin = `https://${url.hostname}`;
  const dashboards = path === "/" ? origin : `${origin}${path}`;
  return {
    dashboards,
    links: [
      { label: "Dashboards", url: dashboards },
      // Where the Free plan's allowance can be checked (spec 27 §3.3).
      { label: "Billing and usage", url: `${origin}/organization/billing` },
    ],
  };
}

// Whitespace or a control character anywhere in the value. The address parser
// quietly deletes tabs and newlines, so a mangled value would otherwise be
// accepted as a different address from the one that was typed.
const UNSAFE_CHARACTERS = /[\u0000-\u0020\u007f-\u009f]/;

/** The trimmed value, `null` when unset or blank, or `""` when set but containing characters no address should. */
function read(
  source: OperationalLinksSource,
  name: OperationalLinkSetting,
): string | null {
  const raw = source[name]?.trim();
  if (!raw) return null;
  return UNSAFE_CHARACTERS.test(raw) ? "" : raw;
}

/**
 * Resolves the link settings in `source`. Total: any input, including garbage in
 * both variables, yields a value and never throws.
 */
export function parseOperationalLinks(
  source: OperationalLinksSource,
): OperationalLinks {
  const rejected: OperationalLinkSetting[] = [];

  const rawGrafana = read(source, "GRAFANA_STACK_URL");
  const grafana = rawGrafana ? parseGrafana(rawGrafana) : undefined;
  if (rawGrafana !== null && !grafana) rejected.push("GRAFANA_STACK_URL");

  const rawPostHog = read(source, "POSTHOG_DASHBOARDS_URL");
  const posthog = rawPostHog ? parsePostHog(rawPostHog) : undefined;
  if (rawPostHog !== null && !posthog) rejected.push("POSTHOG_DASHBOARDS_URL");

  return { grafana: grafana ?? null, posthog: posthog ?? null, rejected };
}
