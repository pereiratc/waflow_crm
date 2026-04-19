import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE } from "../lib/api";

type Health = { status?: string } | Record<string, unknown>;

export default function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [ready, setReady] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      try {
        const [h, r] = await Promise.all([
          fetch(`${API_BASE}/health`),
          fetch(`${API_BASE}/ready`),
        ]);
        setHealth(h.ok ? await h.json() : { error: h.status });
        setReady(r.ok ? await r.json() : { error: r.status });
      } catch (e: unknown) {
        setErr((e as Error).message);
      }
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/" style={{ opacity: 0.85 }}>
          ← Dashboard
        </Link>
      </p>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>API status</h1>
      <p style={{ opacity: 0.75, marginBottom: 20 }}>
        Public <code>/health</code> and <code>/ready</code> against <b>{API_BASE}</b>.
      </p>
      {err && <p style={{ color: "#fca5a5" }}>{err}</p>}
      <div style={{ display: "grid", gap: 16 }}>
        <pre style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", overflow: "auto" }}>{JSON.stringify(health, null, 2)}</pre>
        <pre style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", overflow: "auto" }}>{JSON.stringify(ready, null, 2)}</pre>
      </div>
    </div>
  );
}
