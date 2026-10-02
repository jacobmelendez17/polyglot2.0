import { cn } from "@/lib/utils";

/**
 * Decorative falling leaves for the welcome slide, the same motif as the Practice hub's hero
 * but falling the full height of the slide. Positions, speeds, and delays are fixed data so
 * the server render and the client agree, and each leaf takes a color from the existing
 * token set. Hidden under reduced motion (see `.ob-leaf` in onboarding.css).
 */
const LEAVES = [
  { left: "4%", color: "bg-practice-listening", duration: 13, delay: 0 },
  { left: "41%", color: "bg-practice-speaking", duration: 16, delay: -2.4 },
  { left: "78%", color: "bg-practice-reading", duration: 19, delay: -4.8 },
  { left: "23%", color: "bg-srs-familiar", duration: 22, delay: -7.2 },
  { left: "60%", color: "bg-learning-grammar", duration: 13, delay: -9.6 },
  { left: "93%", color: "bg-practice-listening", duration: 16, delay: -12 },
  { left: "33%", color: "bg-practice-speaking", duration: 19, delay: -14.4 },
  { left: "70%", color: "bg-practice-reading", duration: 22, delay: -16.8 },
] as const;

export function FallingLeaves() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
    >
      {LEAVES.map((leaf) => (
        <span
          key={leaf.left}
          className={cn("ob-leaf", leaf.color)}
          style={{
            left: leaf.left,
            animationDuration: `${leaf.duration}s`,
            animationDelay: `${leaf.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
