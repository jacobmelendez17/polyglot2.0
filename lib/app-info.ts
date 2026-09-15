/**
 * Shared, non-secret product identity constants. Spec 21 (Footer) needs a
 * single source for the app name/tagline/version label rather than
 * hardcoding them in the footer component — this is that source, and future
 * surfaces (e.g. a settings "About" section) should read from it too.
 */
export const APP_NAME = "Polyglot";

export const APP_TAGLINE = "Learn a little. Remember a lot.";

/**
 * Public-facing version label shown in the footer. Beta status and the
 * version number are both product/marketing decisions, not derived from
 * `package.json`'s semver (which tracks the codebase, not what's announced
 * to learners) — bump this by hand when the public version changes.
 */
export const APP_VERSION_LABEL = "Beta 0.1";
