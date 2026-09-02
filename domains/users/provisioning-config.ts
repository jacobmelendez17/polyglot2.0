/**
 * The configured default language for new-user provisioning (spec 08 §11).
 * Resolved by stable code, never a hardcoded UUID and never "first row" —
 * matches the "es-MX" convention already established by
 * `domains/curriculum`'s fixture data (`FIXTURE_LANGUAGE_ID`).
 */
const DEFAULT_LANGUAGE_CODE = "es-MX";

export function getDefaultLanguageCode(): string {
  return DEFAULT_LANGUAGE_CODE;
}
