type WelcomeGreetingProps = {
  name: string;
};

export function WelcomeGreeting({ name }: WelcomeGreetingProps) {
  return (
    <h1 className="font-heading text-3xl font-semibold text-muted-foreground sm:text-4xl">
      Welcome back, <span className="text-foreground">{name}</span>.
    </h1>
  );
}
