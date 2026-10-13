/**
 * What to tell someone before a status change they are about to save takes
 * effect — a pure type, so a screen's model can build one without importing a
 * client component.
 */
export type StatusImpact = {
  title: string;
  /** What happens — stated only as far as the code guarantees it. */
  body: string;
  confirmLabel: string;
  /** Style the confirm button as a warning: the change takes something out of use. */
  destructive?: boolean;
};
