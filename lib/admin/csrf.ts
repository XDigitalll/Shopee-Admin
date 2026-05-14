export const XSRF_COOKIE = "XSRF-TOKEN";
export const XSRF_HEADER = "X-XSRF-TOKEN";

/**
 * Reads the XSRF-TOKEN cookie value set by Spring Boot via the Next.js proxy.
 * Returns an empty string in SSR context (cookie is browser-only).
 */
export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(XSRF_COOKIE + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : "";
}
