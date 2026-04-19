import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { API_BASE, apiErrorMessage } from "../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem("access_token")) router.replace("/");
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, string> = {
        organization_name: organizationName.trim(),
        email: email.trim(),
        password,
      };
      if (fullName.trim()) body.full_name = fullName.trim();

      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await apiErrorMessage(res));
        return;
      }
      const data = await res.json();
      localStorage.setItem("access_token", data.access_token);
      router.replace("/");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: 440, maxWidth: "100%", padding: 24, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>Create organization</h1>
        <p style={{ opacity: 0.75, fontSize: 14, marginTop: -8, marginBottom: 16 }}>
          Registers a new org and makes you <b>admin</b>. Use a unique email.
        </p>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Organization name
            <input
              required
              minLength={2}
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Your email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Password (min 8 characters)
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Full name (optional)
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #059669, #2563eb)",
              color: "white",
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            {loading ? "Creating…" : "Register & sign in"}
          </button>

          {error && <p style={{ color: "#fca5a5", margin: 0 }}>{error}</p>}
        </form>

        <p style={{ marginTop: 20, fontSize: 14, opacity: 0.8 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
