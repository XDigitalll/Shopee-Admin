export function getBackendUrl() {
  const backendUrl = process.env.BACKEND_URL?.trim();
  if (backendUrl) {
    return backendUrl.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:8080";
  }

  throw new Error("BACKEND_URL is required in production.");
}
