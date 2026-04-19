import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { API_BASE, apiErrorMessage, authHeaders } from "../lib/api";

type Pipeline = { id: string; name: string; description: string | null };
type Stage = { id: string; name: string; stage_order: number; is_final: boolean };
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
type Contact = { id: string; phone_number: string; full_name: string | null };
type TeamUser = { id: string; email: string; full_name: string | null; role: string };

export default function PipelinePage() {
  const router = useRouter();
  const [meRole, setMeRole] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pid, setPid] = useState<string>("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [newPlName, setNewPlName] = useState("Sales");
  const [newPlDesc, setNewPlDesc] = useState("");
  const [newPlStages, setNewPlStages] = useState("New\nQualified\nClosed won");

  const [leadContactId, setLeadContactId] = useState("");
  const [leadPriority, setLeadPriority] = useState("normal");

  const stageName = useCallback(
    (id: string | null) => {
      if (!id) return "—";
      return stages.find((s) => s.id === id)?.name || id.slice(0, 8) + "…";
    },
    [stages],
  );

  const reloadPipelines = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/pipelines`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await apiErrorMessage(res));
    const data = (await res.json()) as Pipeline[];
    setPipelines(data);
    return data;
  }, []);

  const loadLeads = useCallback(async (pipelineId: string) => {
    if (!pipelineId) {
      setLeads([]);
      return;
    }
    const res = await fetch(`${API_BASE}/api/leads?pipeline_id=${encodeURIComponent(pipelineId)}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await apiErrorMessage(res));
    setLeads(await res.json());
  }, []);

  const loadStages = useCallback(async (pipelineId: string) => {
    if (!pipelineId) {
      setStages([]);
      return;
    }
    const res = await fetch(`${API_BASE}/api/pipelines/${pipelineId}/stages`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await apiErrorMessage(res));
    setStages(await res.json());
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const [meRes, ctRes, tmRes] = await Promise.all([
          fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() }),
          fetch(`${API_BASE}/api/contacts`, { headers: authHeaders() }),
          fetch(`${API_BASE}/api/team/users`, { headers: authHeaders() }),
        ]);
        if (meRes.ok) {
          const m = await meRes.json();
          setMeRole(m.role);
        }
        if (ctRes.ok) setContacts(await ctRes.json());
        if (tmRes.ok) setTeam(await tmRes.json());
        const data = await reloadPipelines();
        if (data[0]) setPid(data[0].id);
      } catch (e: unknown) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, reloadPipelines]);

  useEffect(() => {
    if (!pid) return;
    (async () => {
      try {
        await loadStages(pid);
        await loadLeads(pid);
      } catch (e: unknown) {
        setErr((e as Error).message);
      }
    })();
  }, [pid, loadStages, loadLeads]);

  const canManagePipeline = meRole === "admin" || meRole === "manager";

  async function createPipeline() {
    setErr(null);
    setMsg(null);
    if (!canManagePipeline) return;
    const lines = newPlStages
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) {
      setErr("Add at least one stage name (one per line).");
      return;
    }
    const body = {
      name: newPlName.trim(),
      description: newPlDesc.trim() || null,
      stages: lines.map((name, i) => ({
        name,
        is_final: i === lines.length - 1,
      })),
    };
    const res = await fetch(`${API_BASE}/api/pipelines`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setErr(await apiErrorMessage(res));
      return;
    }
    const j = await res.json();
    setMsg("Pipeline created.");
    const data = await reloadPipelines();
    if (j.id) setPid(j.id);
    else if (data[0]) setPid(data[0].id);
  }

  async function createLead() {
    setErr(null);
    setMsg(null);
    if (!pid || !leadContactId) {
      setErr("Select a contact for the new lead.");
      return;
    }
    const res = await fetch(`${API_BASE}/api/leads`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        contact_id: leadContactId,
        pipeline_id: pid,
        stage_id: null,
        priority: leadPriority,
      }),
    });
    if (!res.ok) {
      setErr(await apiErrorMessage(res));
      return;
    }
    setMsg("Lead created.");
    await loadLeads(pid);
  }

  async function moveLead(leadId: string, stageId: string) {
    setErr(null);
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/stage`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ stage_id: stageId }),
    });
    if (!res.ok) setErr(await apiErrorMessage(res));
    else await loadLeads(pid);
  }

  async function patchLead(leadId: string, body: { priority?: string; assigned_user_id?: string | null }) {
    setErr(null);
    const res = await fetch(`${API_BASE}/api/leads/${leadId}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) setErr(await apiErrorMessage(res));
    else await loadLeads(pid);
  }

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Pipeline & leads</h1>
      {err && <p style={{ color: "#fca5a5" }}>{err}</p>}
      {msg && <p style={{ color: "#86efac" }}>{msg}</p>}
      {loading && <p>Loading…</p>}

      {canManagePipeline && (
        <section style={{ marginBottom: 24, padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)" }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>New pipeline</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 }}>
            <input value={newPlName} onChange={(e) => setNewPlName(e.target.value)} placeholder="Name" style={inp} />
            <input value={newPlDesc} onChange={(e) => setNewPlDesc(e.target.value)} placeholder="Description (optional)" style={inp} />
            <label style={{ fontSize: 13, opacity: 0.85 }}>
              Stages (one per line; last line is marked as final stage)
              <textarea value={newPlStages} onChange={(e) => setNewPlStages(e.target.value)} rows={4} style={{ ...inp, marginTop: 6 }} />
            </label>
            <button type="button" onClick={createPipeline} style={btn}>
              Create pipeline
            </button>
          </div>
        </section>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 400 }}>
          Active pipeline
          <select value={pid} onChange={(e) => setPid(e.target.value)} style={sel} disabled={!pipelines.length}>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {!pipelines.length && !loading && <p style={{ marginTop: 8, opacity: 0.75 }}>Create a pipeline below (admin/manager) to manage leads.</p>}
      </div>

      <section style={{ marginBottom: 24, padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", opacity: pid ? 1 : 0.5 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>New lead</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Contact
            <select value={leadContactId} onChange={(e) => setLeadContactId(e.target.value)} style={sel}>
              <option value="">Select…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.phone_number} {c.full_name ? `· ${c.full_name}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Priority
            <select value={leadPriority} onChange={(e) => setLeadPriority(e.target.value)} style={sel}>
              {(["low", "normal", "high", "urgent"] as const).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={createLead} style={btn} disabled={!pid || !pipelines.length}>
            Create lead
          </button>
        </div>
      </section>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
              <th style={{ padding: "8px 12px" }}>Contact</th>
              <th style={{ padding: "8px 12px" }}>Stage</th>
              <th style={{ padding: "8px 12px" }}>Priority</th>
              <th style={{ padding: "8px 12px" }}>Assignee</th>
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
                <td style={{ padding: "10px 12px" }}>
                  <select
                    value={l.current_stage_id || ""}
                    onChange={(e) => moveLead(l.id, e.target.value)}
                    style={selSm}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <select
                    value={l.priority}
                    onChange={(e) => patchLead(l.id, { priority: e.target.value })}
                    style={selSm}
                  >
                    {(["low", "normal", "high", "urgent"] as const).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <select
                    value={l.assigned_user_id || ""}
                    onChange={(e) => patchLead(l.id, { assigned_user_id: e.target.value || null })}
                    style={selSm}
                  >
                    <option value="">Unassigned</option>
                    {team.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  {l.status}
                  <div style={{ fontSize: 11, opacity: 0.6 }}>{stageName(l.current_stage_id)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!leads.length && !loading && <p style={{ opacity: 0.7, marginTop: 12 }}>No leads in this pipeline</p>}
    </Layout>
  );
}

const inp: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "inherit",
};

const sel: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  background: "#111827",
  color: "inherit",
  border: "1px solid rgba(255,255,255,0.15)",
};

const selSm: React.CSSProperties = { ...sel, padding: "6px 8px", fontSize: 13 };

const btn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
  color: "white",
  cursor: "pointer",
};
