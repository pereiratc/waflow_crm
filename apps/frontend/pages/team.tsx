import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { API_BASE, apiErrorMessage, authHeaders } from "../lib/api";

type TeamUser = { id: string; email: string; full_name: string | null; role: string };

export default function TeamPage() {
  const router = useRouter();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/team/users`, { headers: authHeaders() });
        if (!res.ok) throw new Error(await apiErrorMessage(res));
        setUsers(await res.json());
      } catch (e: unknown) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Team</h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>Active users in your organization (same list used for inbox assignment).</p>
      {err && <p style={{ color: "#fca5a5" }}>{err}</p>}
      {loading && <p>Loading…</p>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
              <th style={{ padding: "8px 12px" }}>Email</th>
              <th style={{ padding: "8px 12px" }}>Name</th>
              <th style={{ padding: "8px 12px" }}>Role</th>
              <th style={{ padding: "8px 12px" }}>Id</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "10px 12px" }}>{u.email}</td>
                <td style={{ padding: "10px 12px", opacity: 0.9 }}>{u.full_name || "—"}</td>
                <td style={{ padding: "10px 12px" }}>{u.role}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, opacity: 0.65 }}>{u.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!users.length && !loading && <p style={{ opacity: 0.7, marginTop: 12 }}>No users returned.</p>}
    </Layout>
  );
}
