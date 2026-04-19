import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { API_BASE, apiErrorMessage, authHeaders } from "../lib/api";

type Usage = {
  plan: string;
  stripe_customer_id: string | null;
  limits: { users: number; automation_rules: number };
  usage: { users: number; automation_rules: number };
};

export default function BillingPage() {
  const router = useRouter();
  const [u, setU] = useState<Usage | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    (async () => {
      const [usageRes, meRes] = await Promise.all([
        fetch(`${API_BASE}/api/billing/usage`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() }),
      ]);
      if (usageRes.ok) setU(await usageRes.json());
      if (meRes.ok) {
        const m = await meRes.json();
        setMeRole(m.role);
      }
    })();
  }, [router]);

  async function mockSubscribe(plan: "pro" | "free") {
    setMsg(null);
    setErr(null);
    const res = await fetch(`${API_BASE}/api/billing/mock/subscribe`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) {
      setErr(await apiErrorMessage(res));
      return;
    }
    setMsg("Plan updated.");
    const r = await fetch(`${API_BASE}/api/billing/usage`, { headers: authHeaders() });
    if (r.ok) setU(await r.json());
  }

  async function testEmail() {
    setMsg(null);
    setErr(null);
    const res = await fetch(`${API_BASE}/api/billing/test-email`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setErr(await apiErrorMessage(res));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setMsg(JSON.stringify(data));
  }

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Billing & email</h1>
      {u && (
        <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", marginBottom: 20 }}>
          <p>
            <b>Plan:</b> {u.plan}
          </p>
          <p style={{ opacity: 0.85 }}>
            Stripe customer (mock): {u.stripe_customer_id || "—"}
          </p>
          <p>
            Users: {u.usage.users} / {u.limits.users}
          </p>
          <p>
            Automation rules: {u.usage.automation_rules} / {u.limits.automation_rules}
          </p>
        </div>
      )}
      {meRole === "admin" && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => mockSubscribe("pro")}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg, #059669, #2563eb)",
              color: "white",
              cursor: "pointer",
            }}
          >
            Mock upgrade to Pro
          </button>
          <button
            type="button"
            onClick={() => mockSubscribe("free")}
            style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "inherit", cursor: "pointer" }}
          >
            Downgrade to Free
          </button>
        </div>
      )}
      {(meRole === "admin" || meRole === "manager") && (
        <button
          type="button"
          onClick={testEmail}
          style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "inherit", cursor: "pointer" }}
        >
          Send test email (SMTP or mock log)
        </button>
      )}
      {msg && <p style={{ color: "#86efac", marginTop: 12 }}>{msg}</p>}
      {err && <p style={{ color: "#fca5a5", marginTop: 12 }}>{err}</p>}
      <p style={{ opacity: 0.65, fontSize: 13, marginTop: 24 }}>
        Configure SMTP via SMTP_HOST, EMAIL_FROM, etc. Without them, test email is logged server-side only.
      </p>
    </Layout>
  );
}
