import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { API_BASE, apiErrorMessage, authHeaders } from "../lib/api";

type Contact = {
  id: string;
  phone_number: string;
  full_name: string | null;
  email: string | null;
  owner_user_id: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

type TeamUser = { id: string; email: string; full_name: string | null; role: string };

export default function ContactsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Contact[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editOwner, setEditOwner] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchList = useCallback(async (search: string) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`${API_BASE}/api/contacts?${params}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await apiErrorMessage(res));
    setRows(await res.json());
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const tr = await fetch(`${API_BASE}/api/team/users`, { headers: authHeaders() });
        if (!cancelled && tr.ok) setTeam(await tr.json());
        if (!cancelled) await fetchList("");
      } catch (e: unknown) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, fetchList]);

  async function openDetail(c: Contact) {
    setErr(null);
    setMsg(null);
    const res = await fetch(`${API_BASE}/api/contacts/${c.id}`, { headers: authHeaders() });
    if (!res.ok) {
      setErr(await apiErrorMessage(res));
      return;
    }
    const full = (await res.json()) as Contact;
    setSelected(full);
    setEditName(full.full_name || "");
    setEditEmail(full.email || "");
    setEditStatus(full.status || "active");
    setEditOwner(full.owner_user_id || "");
  }

  async function savePatch() {
    if (!selected) return;
    setErr(null);
    setMsg(null);
    const body: Record<string, unknown> = {
      full_name: editName.trim() || null,
      status: editStatus.trim() || "active",
    };
    if (editEmail.trim()) body.email = editEmail.trim();
    else body.email = null;
    body.owner_user_id = editOwner ? editOwner : null;

    const res = await fetch(`${API_BASE}/api/contacts/${selected.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setErr(await apiErrorMessage(res));
      return;
    }
    setMsg("Saved.");
    await fetchList(q);
    const r = await fetch(`${API_BASE}/api/contacts/${selected.id}`, { headers: authHeaders() });
    if (r.ok) setSelected(await r.json());
  }

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Contacts</h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>Search and edit CRM contacts (from WhatsApp and other sources).</p>
      {err && <p style={{ color: "#fca5a5" }}>{err}</p>}
      {msg && <p style={{ color: "#86efac" }}>{msg}</p>}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search phone, name, email…"
          style={{ flex: 1, minWidth: 200, padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
        />
        <button
          type="button"
          onClick={() => fetchList(q).catch((e) => setErr((e as Error).message))}
          style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "white", cursor: "pointer" }}
        >
          Search
        </button>
      </div>
      {loading && <p>Loading…</p>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(0, 1.2fr)", gap: 20, alignItems: "start" }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden" }}>
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => openDetail(c)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: 12,
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                background: selected?.id === c.id ? "rgba(37,99,235,0.2)" : "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.phone_number}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{c.full_name || "—"} · {c.status}</div>
            </button>
          ))}
          {!rows.length && !loading && <p style={{ padding: 16, opacity: 0.7 }}>No contacts</p>}
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 16 }}>
          {!selected && <p style={{ opacity: 0.7 }}>Select a contact</p>}
          {selected && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ margin: 0, opacity: 0.85 }}>
                <b>Phone:</b> {selected.phone_number}
              </p>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                Full name
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                Email
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                Status
                <input
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                Owner
                <select
                  value={editOwner}
                  onChange={(e) => setEditOwner(e.target.value)}
                  style={{ padding: 10, borderRadius: 8, background: "#111827", color: "inherit", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  <option value="">None</option>
                  {team.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={savePatch}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: "white",
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                Save changes
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
