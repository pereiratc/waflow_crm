import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Layout } from "../components/Layout";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type MeResponse = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  organization_id: string;
  is_active: boolean;
  organization_name: string;
  billing_plan: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    plan: string;
    usage: { automation_rules: number };
    limits: { automation_rules: number };
  } | null>(null);
  const [inboxMetrics, setInboxMetrics] = useState<{
    conversations_total: number;
    awaiting_reply: number;
    unassigned: number;
    assigned_to_me: number;
  } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    async function loadMe() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Not authorized");
        setMe(await res.json());
        const bu = await fetch(`${API_BASE}/api/billing/usage`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (bu.ok) setUsage(await bu.json());
        const im = await fetch(`${API_BASE}/api/inbox/metrics`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (im.ok) setInboxMetrics(await im.json());
      } catch (err: any) {
        setError(err?.message || "Failed");
        localStorage.removeItem("access_token");
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    }

    loadMe();
  }, [router]);

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>WaFlow CRM</h1>
      <p style={{ opacity: 0.85, marginBottom: 20 }}>
        Quick links: <Link href="/inbox">Inbox</Link>
        {" · "}
        <Link href="/pipeline">Pipeline</Link>
        {" · "}
        <Link href="/billing">Billing</Link>
      </p>
      {loading && <p>Loading...</p>}
      {!loading && error && <p style={{ color: "#fca5a5" }}>{error}</p>}

      {me && (
        <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", maxWidth: 640 }}>
          <p style={{ margin: 0 }}>
            Signed in as: <b>{me.email}</b>
          </p>
          <p style={{ margin: "8px 0 0" }}>
            Role: <b>{me.role}</b>
          </p>
          <p style={{ margin: "8px 0 0", opacity: 0.85 }}>
            Organization: <b>{me.organization_name}</b>{" "}
            <span style={{ opacity: 0.7 }}>({me.organization_id})</span>
          </p>
          <p style={{ margin: "6px 0 0", opacity: 0.9 }}>
            Plan: <b>{me.billing_plan}</b>
          </p>
          {usage && (
            <p style={{ margin: "12px 0 0", opacity: 0.9 }}>
              Plan <b>{usage.plan}</b> · automation rules {usage.usage.automation_rules}/{usage.limits.automation_rules}
            </p>
          )}
          {inboxMetrics && (
            <p style={{ margin: "12px 0 0", opacity: 0.9 }}>
              Inbox: <b>{inboxMetrics.conversations_total}</b> threads · <b>{inboxMetrics.awaiting_reply}</b> awaiting
              reply · <b>{inboxMetrics.unassigned}</b> unassigned · <b>{inboxMetrics.assigned_to_me}</b> assigned to
              you
            </p>
          )}
        </div>
      )}
    </Layout>
  );
}

