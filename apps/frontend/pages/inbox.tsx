import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Conv = {
  id: string;
  external_phone: string;
  assigned_user_id: string | null;
  awaiting_reply: boolean;
  last_message_at: string | null;
};

type Msg = {
  id: string;
  direction: string;
  content_text: string | null;
  created_at: string;
};

type TeamUser = { id: string; email: string; full_name: string | null; role: string };

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export default function InboxPage() {
  const router = useRouter();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [filterAwaiting, setFilterAwaiting] = useState(false);

  const loadConvs = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterUnassigned) params.set("assigned_user_id", "unassigned");
    if (filterAwaiting) params.set("awaiting_reply", "true");
    const res = await fetch(`${API_BASE}/api/inbox/conversations?${params}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to load conversations");
    setConvs(await res.json());
  }, [filterUnassigned, filterAwaiting]);

  const loadTeam = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/team/users`, { headers: authHeaders() });
    if (res.ok) setTeam(await res.json());
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
        await loadTeam();
        if (!cancelled) await loadConvs();
      } catch (e: unknown) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, filterUnassigned, filterAwaiting, loadConvs, loadTeam]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    (async () => {
      const res = await fetch(`${API_BASE}/api/inbox/conversations/${selected}/messages`, { headers: authHeaders() });
      if (res.ok) setMessages(await res.json());
    })();
  }, [selected]);

  async function sendMessage() {
    if (!selected || !text.trim()) return;
    setErr(null);
    const res = await fetch(`${API_BASE}/api/inbox/conversations/${selected}/send`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ text: text.trim() }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErr(typeof b.detail === "string" ? b.detail : JSON.stringify(b.detail || b));
      return;
    }
    setText("");
    const r = await fetch(`${API_BASE}/api/inbox/conversations/${selected}/messages`, { headers: authHeaders() });
    if (r.ok) setMessages(await r.json());
    loadConvs();
  }

  async function assign(uid: string | null) {
    if (!selected) return;
    const res = await fetch(`${API_BASE}/api/inbox/conversations/${selected}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ assigned_user_id: uid }),
    });
    if (!res.ok) {
      setErr("Assign failed");
      return;
    }
    loadConvs();
  }

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Shared inbox</h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>
        Filters: unassigned only, awaiting reply. Assign conversations to team members.
      </p>
      {err && <p style={{ color: "#fca5a5" }}>{err}</p>}
      {loading && <p>Loading…</p>}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={filterUnassigned} onChange={(e) => setFilterUnassigned(e.target.checked)} />
          Unassigned only
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={filterAwaiting} onChange={(e) => setFilterAwaiting(e.target.checked)} />
          Awaiting reply
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(0, 2fr)", gap: 20 }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden" }}>
          {convs.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: 12,
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                background: selected === c.id ? "rgba(37,99,235,0.25)" : "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.external_phone}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {c.awaiting_reply ? "Needs reply" : "—"} · {c.assigned_user_id ? "Assigned" : "Unassigned"}
              </div>
            </button>
          ))}
          {!convs.length && !loading && <p style={{ padding: 16, opacity: 0.7 }}>No conversations</p>}
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 16, minHeight: 360 }}>
          {!selected && <p style={{ opacity: 0.7 }}>Select a conversation</p>}
          {selected && (
            <>
              <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ opacity: 0.8 }}>Assign:</span>
                <select
                  style={{ padding: 8, borderRadius: 8, background: "#111827", color: "inherit", border: "1px solid rgba(255,255,255,0.15)" }}
                  onChange={(e) => assign(e.target.value || null)}
                  value={convs.find((x) => x.id === selected)?.assigned_user_id || ""}
                >
                  <option value="">Unassigned</option>
                  {team.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 12 }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      marginBottom: 8,
                      textAlign: m.direction === "outgoing" ? "right" : "left",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: m.direction === "outgoing" ? "rgba(37,99,235,0.35)" : "rgba(255,255,255,0.08)",
                        maxWidth: "85%",
                      }}
                    >
                      {m.content_text || "(no text)"}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Reply (inside 24h customer window)…"
                  style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
