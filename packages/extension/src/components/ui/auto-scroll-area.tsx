"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "./scroll-area";

interface AutoScrollAreaProps {
  /** When this value changes, auto-scroll to bottom */
  trigger: unknown;
  children: React.ReactNode;
  className?: string;
}

/**
 * ScrollArea that automatically scrolls to bottom when `trigger` changes.
 * Useful for chat/log streaming where new content arrives incrementally.
 */
export function AutoScrollArea({ trigger, children, className, ...props }: AutoScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [trigger]);

  return (
    <ScrollArea viewportRef={viewportRef} className={className} {...props}>
      {children}
      {/* Bottom anchor ensures scrollHeight accounts for last content */}
      <div style={{ height: 1 }} />
    </ScrollArea>
  );
}
