"use client";

import { useEffect, useState } from "react";

export type AdminBreakpoint = "mobile" | "tablet" | "desktop";

function getBreakpoint(width: number): AdminBreakpoint {
  if (width < 768) return "mobile";
  if (width < 1180) return "tablet";
  return "desktop";
}

export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<AdminBreakpoint>("desktop");

  useEffect(() => {
    function update() {
      setBreakpoint(getBreakpoint(window.innerWidth));
    }

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return breakpoint;
}

export function useIsMobile() {
  return useBreakpoint() === "mobile";
}
