import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Layout } from "../components/Layout";
import { API_BASE } from "../lib/api";

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

const card: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  textDecoration: "none",
  color: "inherit",
  display: "block",
  transition: "border-color 0.15s",
};

export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    plan: string;
    usage: { automation_rules: number; users: number };
    limits: { automation_rules: number; users: number };
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
      } catch (err: unknown) {
        setError((err as Error).message);
        localStorage.removeItem("access_token");
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    }

    loadMe();
  }, [router]);

  const links: { href: string; title: string; desc: string }[] = [
    { href: "/inbox", title: "Inbox", desc: "Conversations, assign, text, templates, media, uploads" },
    { href: "/pipeline", title: "Pipeline", desc: "Pipelines, stages, leads, move & assign" },
    { href: "/contacts", title: "Contacts", desc: "Search and edit contacts" },
    { href: "/automation", title: "Automation", desc: "Rules (admin/manager creates)" },
    { href: "/team", title: "Team", desc: "Organization users" },
    { href: "/whatsapp", title: "WhatsApp", desc: "phone_number_id → tenant routing" },
    { href: "/billing", title: "Billing", desc: "Usage, mock plan, test email" },
    { href: "/realtime", title: "Realtime", desc: "Socket.IO connection test" },
    { href: "/status", title: "API status", desc: "/health and /ready (no login)" },
  ];

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>WaFlow CRM</h1>
      <p style={{ opacity: 0.85, marginBottom: 20 }}>
        Signed-in overview. New here?{" "}
        <Link href="/register" style={{ textDecoration: "underline" }}>
          Register an organization
        </Link>
        .
      </p>
      {loading && <p>Loading...</p>}
      {!loading && error && <p style={{ color: "#fca5a5" }}>{error}</p>}

      {me && (
        <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", maxWidth: 720, marginBottom: 24 }}>
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
              Plan <b>{usage.plan}</b> · users {usage.usage.users}/{usage.limits.users} · automation rules{" "}
              {usage.usage.automation_rules}/{usage.limits.automation_rules}
            </p>
          )}
          {inboxMetrics && (
            <p style={{ margin: "12px 0 0", opacity: 0.9 }}>
              Inbox: <b>{inboxMetrics.conversations_total}</b> threads · <b>{inboxMetrics.awaiting_reply}</b> awaiting reply ·{" "}
              <b>{inboxMetrics.unassigned}</b> unassigned · <b>{inboxMetrics.assigned_to_me}</b> assigned to you
            </p>
          )}
        </div>
      )}

      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Modules</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {links.map((l) => (
          <Link key={l.href} href={l.href} style={card}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{l.title}</div>
            <div style={{ fontSize: 13, opacity: 0.78, lineHeight: 1.4 }}>{l.desc}</div>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
