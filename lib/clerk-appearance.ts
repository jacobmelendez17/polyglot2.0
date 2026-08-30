// Maps Clerk's theming variables onto Polyglot's own CSS custom properties
// (see ui-context.md) instead of a generic preset, so Clerk's UI follows the
// app's light/dark tokens automatically via normal CSS cascade.
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--accent-primary)",
    colorPrimaryForeground: "var(--accent-foreground)",
    colorDanger: "var(--state-error)",
    colorSuccess: "var(--state-success)",
    colorWarning: "var(--state-warning)",
    colorNeutral: "var(--text-primary)",
    colorForeground: "var(--text-primary)",
    colorMuted: "var(--bg-soft)",
    colorMutedForeground: "var(--text-muted)",
    colorBackground: "var(--bg-surface)",
    colorInputForeground: "var(--text-primary)",
    colorInput: "var(--bg-base)",
    colorRing: "var(--accent-primary)",
    colorBorder: "var(--border-default)",
    fontFamily: "var(--font-sans)",
    borderRadius: "var(--radius-lg)",
  },
};
