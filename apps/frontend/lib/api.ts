export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL || "http://localhost:4001";

export function authHeaders(json = true): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function apiErrorMessage(res: Response): Promise<string> {
  const b = await res.json().catch(() => ({}));
  const d = (b as { detail?: unknown }).detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((x: unknown) => {
        if (typeof x === "object" && x !== null && "msg" in x) return String((x as { msg: string }).msg);
        return JSON.stringify(x);
      })
      .join("; ");
  }
  if (d && typeof d === "object") return JSON.stringify(d);
  return res.statusText || "Request failed";
}
