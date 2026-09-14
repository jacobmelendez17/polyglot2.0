/**
 * Spec 20 Notifications. Pure type + the one place these defaults are
 * written down — "defaults must be centralized... do not independently
 * hardcode a default in React, Server Actions, or repositories." Every
 * field defaults `true`, matching the spec's stated default for each
 * toggle exactly ("Absence of a row resolves to all true for these
 * optional categories").
 *
 * Transactional Emails has no field here — the spec gives it no toggle
 * ("cannot be disabled"), so there is nothing to store or resolve.
 */
export type NotificationPreferences = {
  newsUpdates: boolean;
  progressEmail: boolean;
  inactivityEmail: boolean;
  trialEmail: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  newsUpdates: true,
  progressEmail: true,
  inactivityEmail: true,
  trialEmail: true,
};
