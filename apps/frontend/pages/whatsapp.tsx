import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { API_BASE, apiErrorMessage, authHeaders } from "../lib/api";

type RouteRow = { id: string; phone_number_id: string; is_active: boolean; created_at: string | null };

export default function WhatsappSettingsPage() {
  const router = useRouter();
  const [meRole, setMeRole] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadRoutes = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/whatsapp/phone-routes`, { headers: authHeaders() });
    if (res.status === 403) {
      setRoutes([]);
      return;
    }
    if (!res.ok) throw new Error(await apiErrorMessage(res));
    setRoutes(await res.json());
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const meRes = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
        if (!meRes.ok) throw new Error(await apiErrorMessage(meRes));
        const m = await meRes.json();
        setMeRole(m.role);
        if (m.role === "admin" || m.role === "manager") await loadRoutes();
      } catch (e: unknown) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, loadRoutes]);

  const canManage = meRole === "admin" || meRole === "manager";

  async function saveRoute() {
    setErr(null);
    setMsg(null);
    if (!canManage) return;
    const res = await fetch(`${API_BASE}/api/whatsapp/phone-route`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ phone_number_id: phoneNumberId.trim(), is_active: isActive }),
    });
    if (!res.ok) {
      setErr(await apiErrorMessage(res));
      return;
    }
    setMsg("Phone number route saved.");
    setPhoneNumberId("");
    await loadRoutes();
  }

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>WhatsApp routing</h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>
        Map Meta <b>phone_number_id</b> to your organization so inbound webhooks land in the correct tenant. Webhook URL (configure in Meta):{" "}
        <code style={{ fontSize: 12 }}>{API_BASE}/api/whatsapp/webhook</code>
      </p>
      {loading && <p>Loading…</p>}
      {err && <p style={{ color: "#fca5a5" }}>{err}</p>}
      {msg && <p style={{ color: "#86efac" }}>{msg}</p>}

      {!canManage && !loading && (
        <p style={{ opacity: 0.8 }}>Only <b>admin</b> or <b>manager</b> can manage routes. Your role: {meRole || "—"}</p>
      )}

      {canManage && (
        <>
          <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Add or update route</h2>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              phone_number_id
              <input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="From Meta app / phone settings"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit" }}
              />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
            <button type="button" onClick={saveRoute} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "white", cursor: "pointer", alignSelf: "flex-start" }}>
              Save route
            </button>
          </div>

          <h2 style={{ fontSize: 16 }}>Routes for your org</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                <th style={{ padding: "8px 12px" }}>phone_number_id</th>
                <th style={{ padding: "8px 12px" }}>Active</th>
                <th style={{ padding: "8px 12px" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{r.phone_number_id}</td>
                  <td style={{ padding: "10px 12px" }}>{r.is_active ? "yes" : "no"}</td>
                  <td style={{ padding: "10px 12px", opacity: 0.8 }}>{r.created_at || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!routes.length && <p style={{ opacity: 0.7, marginTop: 8 }}>No routes yet.</p>}
        </>
      )}
    </Layout>
  );
}
