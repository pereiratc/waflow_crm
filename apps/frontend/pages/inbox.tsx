import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { API_BASE, apiErrorMessage, authHeaders } from "../lib/api";

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
  message_type?: string;
  content_text: string | null;
  created_at: string;
  attachment?: unknown;
};

type TeamUser = { id: string; email: string; full_name: string | null; role: string };

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

  const [tplName, setTplName] = useState("");
  const [tplLang, setTplLang] = useState("en_US");
  const [tplParams, setTplParams] = useState("");

  const [mediaId, setMediaId] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [mediaCaption, setMediaCaption] = useState("");

  const [lastAttachmentId, setLastAttachmentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadConvs = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterUnassigned) params.set("assigned_user_id", "unassigned");
    if (filterAwaiting) params.set("awaiting_reply", "true");
    const res = await fetch(`${API_BASE}/api/inbox/conversations?${params}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await apiErrorMessage(res));
    setConvs(await res.json());
  }, [filterUnassigned, filterAwaiting]);

  const loadTeam = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/team/users`, { headers: authHeaders() });
    if (res.ok) setTeam(await res.json());
  }, []);

  const reloadMessages = useCallback(async () => {
    if (!selected) return;
    const r = await fetch(`${API_BASE}/api/inbox/conversations/${selected}/messages`, { headers: authHeaders() });
    if (r.ok) setMessages(await r.json());
  }, [selected]);

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

  async function postSend(body: Record<string, unknown>) {
    if (!selected) return;
    setErr(null);
    const res = await fetch(`${API_BASE}/api/inbox/conversations/${selected}/send`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setErr(await apiErrorMessage(res));
      return;
    }
    setText("");
    setTplName("");
    setTplParams("");
    await reloadMessages();
    await loadConvs();
  }

  async function sendMessage() {
    if (!selected || !text.trim()) return;
    await postSend({ text: text.trim() });
  }

  async function sendTemplate() {
    if (!selected || !tplName.trim()) {
      setErr("Template name is required.");
      return;
    }
    const params = tplParams
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    await postSend({
      template_name: tplName.trim(),
      template_language: tplLang.trim() || "en_US",
      template_body_params: params.length ? params : null,
    });
  }

  async function sendMedia() {
    if (!selected || !mediaId.trim()) {
      setErr("media_id is required for media send.");
      return;
    }
    await postSend({
      media_id: mediaId.trim(),
      media_type: mediaType,
      caption: mediaCaption.trim() || null,
    });
  }

  async function sendAttachment(attachmentId: string) {
    await postSend({ attachment_id: attachmentId });
  }

  async function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    setErr(null);
    try {
      const token = localStorage.getItem("access_token");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/inbox/conversations/${selected}/attachments`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        setErr(await apiErrorMessage(res));
        return;
      }
      const j = await res.json();
      setLastAttachmentId(j.id);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function assign(uid: string | null) {
    if (!selected) return;
    const res = await fetch(`${API_BASE}/api/inbox/conversations/${selected}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ assigned_user_id: uid }),
    });
    if (!res.ok) setErr(await apiErrorMessage(res));
    else await loadConvs();
  }

  function msgLabel(m: Msg) {
    const bits = [m.message_type || "text", m.direction].filter(Boolean);
    const extra = m.attachment && typeof m.attachment === "object" ? " · attachment" : "";
    return `(${bits.join(", ")})${extra}`;
  }

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Shared inbox</h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>
        Filters, assignment, free text, <b>templates</b> (outside 24h window), <b>Meta media id</b>, and <b>file uploads</b>.
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
              type="button"
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
                  style={sel}
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
              <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 12 }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      marginBottom: 8,
                      textAlign: m.direction === "outgoing" ? "right" : "left",
                    }}
                  >
                    <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 2 }}>{msgLabel(m)}</div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: m.direction === "outgoing" ? "rgba(37,99,235,0.35)" : "rgba(255,255,255,0.08)",
                        maxWidth: "85%",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.content_text || "(no text)"}
                    </span>
                  </div>
                ))}
              </div>

              <section style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Text (inside customer service window)</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a reply…"
                    style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
                  />
                  <button type="button" onClick={sendMessage} style={btnPrimary}>
                    Send
                  </button>
                </div>
              </section>

              <section style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Template (e.g. outside 24h window)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="template_name" style={inp} />
                  <input value={tplLang} onChange={(e) => setTplLang(e.target.value)} placeholder="language e.g. en_US" style={inp} />
                  <textarea
                    value={tplParams}
                    onChange={(e) => setTplParams(e.target.value)}
                    placeholder="Body parameters, one per line or comma-separated"
                    rows={2}
                    style={{ ...inp, fontSize: 13 }}
                  />
                  <button type="button" onClick={sendTemplate} style={btnSecondary}>
                    Send template
                  </button>
                </div>
              </section>

              <section style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Media (Meta media id)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <input value={mediaId} onChange={(e) => setMediaId(e.target.value)} placeholder="media_id" style={{ ...inp, flex: 1, minWidth: 160 }} />
                  <select value={mediaType} onChange={(e) => setMediaType(e.target.value)} style={sel}>
                    <option value="image">image</option>
                    <option value="document">document</option>
                    <option value="audio">audio</option>
                    <option value="video">video</option>
                  </select>
                </div>
                <input
                  value={mediaCaption}
                  onChange={(e) => setMediaCaption(e.target.value)}
                  placeholder="Caption (optional)"
                  style={{ ...inp, marginTop: 8, width: "100%", boxSizing: "border-box" }}
                />
                <button type="button" onClick={sendMedia} style={{ ...btnSecondary, marginTop: 8 }}>
                  Send media
                </button>
              </section>

              <section style={{ padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Upload file → WhatsApp send</div>
                <input type="file" onChange={onUploadFile} disabled={uploading} />
                {uploading && <span style={{ marginLeft: 8, opacity: 0.8 }}>Uploading…</span>}
                {lastAttachmentId && (
                  <p style={{ fontSize: 13, marginTop: 8 }}>
                    Last upload id: <code>{lastAttachmentId}</code>{" "}
                    <button type="button" style={btnSecondary} onClick={() => sendAttachment(lastAttachmentId)}>
                      Send this file
                    </button>
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

const sel: React.CSSProperties = {
  padding: 8,
  borderRadius: 8,
  background: "#111827",
  color: "inherit",
  border: "1px solid rgba(255,255,255,0.15)",
};

const inp: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "inherit",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
  color: "white",
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  alignSelf: "flex-start",
};
