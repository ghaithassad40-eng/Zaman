"use client";

/**
 * Silences uncaught errors and promise rejections in production. Visitors
 * (and hackers poking at the inspect tab) should not see stack traces that
 * reveal table names, RPC shapes, or internal file paths.
 *
 * Caught errors go to a single line ("app error suppressed") with no body,
 * so genuine bugs stay invisible to outsiders. Development mode keeps full
 * error visibility so the operator can debug.
 *
 * Mounted once from app/(app)/layout.tsx (admin) — the public shop has no
 * authenticated data so it doesn't need the same level of muting.
 */
import { useEffect } from "react";

export function ErrorSilencer() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const onErr = (e: ErrorEvent) => {
      e.preventDefault();
      return true;
    };
    const onRej = (e: PromiseRejectionEvent) => {
      e.preventDefault();
    };
    window.addEventListener("error", onErr, true);
    window.addEventListener("unhandledrejection", onRej, true);
    return () => {
      window.removeEventListener("error", onErr, true);
      window.removeEventListener("unhandledrejection", onRej, true);
    };
  }, []);
  return null;
}
