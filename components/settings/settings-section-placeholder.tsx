type SettingsSectionPlaceholderProps = {
  title: string;
  /** What this section will eventually control — set expectations honestly rather than leaving a bare, unexplained page. */
  description: string;
};

/**
 * Stub body for a Settings section whose controls have not been built yet
 * (spec 20 is implemented as a sequence of separate units — see
 * `progress-tracker.md`'s Current Goal). This is not the "fake
 * functionality" the spec forbids: it renders no toggle, no saved value, no
 * illusion of effect — only an honest "not built yet" notice.
 */
export function SettingsSectionPlaceholder({
  title,
  description,
}: SettingsSectionPlaceholderProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-6">
      <h2 className="font-heading text-lg font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        This section is being built in a later implementation unit.
      </p>
    </div>
  );
}
