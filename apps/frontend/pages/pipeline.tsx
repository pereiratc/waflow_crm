import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Pipeline = { id: string; name: string; description: string | null };
type Lead = {
  id: string;
  contact_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  pipeline_id: string | null;
  current_stage_id: string | null;
  priority: string;
  status: string;
  assigned_user_id: string | null;
};

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export default function PipelinePage() {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pid, setPid] = useState<string>("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    (async () => {
      const res = await fetch(`${API_BASE}/api/pipelines`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
        if (data[0]) setPid(data[0].id);
      }
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    if (!pid) return;
    (async () => {
      const res = await fetch(`${API_BASE}/api/leads?pipeline_id=${encodeURIComponent(pid)}`, { headers: authHeaders() });
      if (res.ok) setLeads(await res.json());
    })();
  }, [pid]);

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Pipeline</h1>
      {loading && <p>Loading…</p>}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 360 }}>
          Pipeline
          <select
            value={pid}
            onChange={(e) => setPid(e.target.value)}
            style={{ padding: 10, borderRadius: 8, background: "#111827", color: "inherit", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
              <th style={{ padding: "8px 12px" }}>Contact</th>
              <th style={{ padding: "8px 12px" }}>Stage</th>
              <th style={{ padding: "8px 12px" }}>Priority</th>
              <th style={{ padding: "8px 12px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "10px 12px", fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{l.contact_phone || "—"}</div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>{l.contact_name || l.id.slice(0, 8) + "…"}</div>
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12 }}>{l.current_stage_id?.slice(0, 8) || "—"}</td>
                <td style={{ padding: "10px 12px" }}>{l.priority}</td>
                <td style={{ padding: "10px 12px" }}>{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!leads.length && !loading && <p style={{ opacity: 0.7, marginTop: 12 }}>No leads in this pipeline</p>}
      </div>
    </Layout>
  );
}
