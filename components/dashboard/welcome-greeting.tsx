type WelcomeGreetingProps = {
  name: string;
};

export function WelcomeGreeting({ name }: WelcomeGreetingProps) {
  return (
    <p className="font-heading text-base text-muted-foreground sm:text-lg">
      Welcome back, <span className="text-foreground">{name}</span>.
    </p>
  );
}
