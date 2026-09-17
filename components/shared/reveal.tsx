"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

// Reduced-motion preference and IntersectionObserver support are static
// browser capabilities the server can't know, and neither ever changes over
// the component's lifetime — there is nothing to subscribe to. `useSyncExternalStore`
// is still the right tool for reading them: its server snapshot (`false`)
// is what both the server and the client's first hydration pass render, so
// hydration never mismatches, and React re-renders with the real client
// snapshot immediately afterward — before paint, so a real reduced-motion
// user still never sees a flash of invisible content.
function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    prefersReducedMotion || typeof window.IntersectionObserver === "undefined"
  );
}

function getServerSnapshot(): boolean {
  return false;
}

export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const immediatelyVisible = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [observedVisible, setObservedVisible] = useState(false);
  const isVisible = immediatelyVisible || observedVisible;

  useEffect(() => {
    if (isVisible) return;

    const node = ref.current;
    if (!node) return;

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setObservedVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: isVisible ? `${delayMs}ms` : "0ms" }}
      className={cn(
        "transition-[opacity,transform] duration-[var(--dur-slow)] ease-[var(--ease-out)]",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
