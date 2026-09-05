type AdminPageHeaderProps = {
  title: string;
  description?: string;
};

/** Shared heading block for every `/admin/*` page (spec 11 §75's suggested org). */
export function AdminPageHeader({ title, description }: AdminPageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
