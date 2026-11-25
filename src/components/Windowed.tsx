"use client";

import { useEffect, useRef, useState } from "react";

/** How far beyond the screen content stays rendered, so fast scrolling never shows a gap. */
const MARGIN = "1500px 0px";

/**
 * Renders its content only while it is near the screen (DIG-29). Far away, the content is
 * replaced by an empty box of the same height, so the grid keeps its shape and scrolling stays
 * smooth on boards of hundreds of photos. The box still names what is there for screen readers,
 * and content holding keyboard focus is never removed. In-house, no dependency.
 */
export function Windowed({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(true);
  const [height, setHeight] = useState<number | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          return;
        }
        if (focused.current) return;
        // Remember the rendered height before the content goes, so nothing below it moves.
        setHeight(el.getBoundingClientRect().height || null);
        setNear(false);
      },
      { rootMargin: MARGIN }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-testid="windowed"
      onFocus={() => (focused.current = true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focused.current = false;
      }}
      style={!near && height ? { height: `${height}px`, flex: "none" } : undefined}
      className="flex flex-1 flex-col"
    >
      {near ? children : <span className="sr-only">{label}</span>}
    </div>
  );
}
