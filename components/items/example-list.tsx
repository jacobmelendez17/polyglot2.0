type ExampleListProps = {
  examples: { targetText: string; translation: string }[];
};

/** Shared by vocabulary and grammar detail — both read models name the fields identically. */
export function ExampleList({ examples }: ExampleListProps) {
  if (examples.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {examples.map((example, index) => (
        <li key={index} className="rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-sm text-foreground">{example.targetText}</p>
          <p className="text-sm text-muted-foreground">{example.translation}</p>
        </li>
      ))}
    </ul>
  );
}
