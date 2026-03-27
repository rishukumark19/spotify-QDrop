const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, "");

export function withApiBase(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

export function getWebSocketUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  if (!API_BASE_URL) {
    return `${protocol}//${window.location.host}${path}`;
  }

  const wsBaseUrl = API_BASE_URL
    .replace(/^http:/i, "ws:")
    .replace(/^https:/i, "wss:");

  return `${wsBaseUrl}${path}`;
}
