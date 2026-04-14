import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("user2@example.com");
  const [password, setPassword] = useState("Password12345");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) router.replace("/");
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Login failed");
      }

      const data = await res.json();
      localStorage.setItem("access_token", data.access_token);
      router.replace("/");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ width: 420, padding: 24, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>WaFlow CRM Login</h1>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
            />
          </label>

          <button
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "white",
              cursor: "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          {error && <p style={{ color: "#fca5a5", margin: 0 }}>{error}</p>}
        </form>
      </div>
    </div>
  );
}

