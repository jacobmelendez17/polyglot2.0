/**
 * Spec 20 General — Content preferences (Hide English during Reviews, NSFW
 * Content). Pure type + the one place the defaults are written down —
 * "defaults must be centralized... do not independently hardcode a default
 * in React, Server Actions, or repositories."
 */
export type ContentPreferences = {
  hideEnglishReviews: boolean;
  showNsfwContent: boolean;
};

export const DEFAULT_CONTENT_PREFERENCES: ContentPreferences = {
  hideEnglishReviews: false,
  showNsfwContent: false,
};
