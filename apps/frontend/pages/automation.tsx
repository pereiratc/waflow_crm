import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { API_BASE, apiErrorMessage, authHeaders } from "../lib/api";

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown> | unknown[];
};

const defaultConditions: Record<string, string> = {
  inactivity: `{
  "channel": "whatsapp",
  "minutes_since_last_incoming": 60,
  "cooldown_minutes": 1440
}`,
  stage_changed: `{
  "to_stage_id": "",
  "from_stage_id": "",
  "cooldown_minutes": 0
}`,
  message_received: `{
  "channel": "whatsapp"
}`,
};

const defaultActions = `[
  {
    "type": "realtime_notify",
    "payload": { "message": "Automation fired" }
  }
]`;

export default function AutomationPage() {
  const router = useRouter();
  const [meRole, setMeRole] = useState<string | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState("My rule");
  const [triggerType, setTriggerType] = useState<"inactivity" | "stage_changed" | "message_received">("inactivity");
  const [conditionsJson, setConditionsJson] = useState(defaultConditions.inactivity);
  const [actionsJson, setActionsJson] = useState(defaultActions);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [meRes, rulesRes] = await Promise.all([
      fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() }),
      fetch(`${API_BASE}/api/automation/rules`, { headers: authHeaders() }),
    ]);
    if (meRes.ok) {
      const m = await meRes.json();
      setMeRole(m.role);
    }
    if (rulesRes.ok) setRules(await rulesRes.json());
  }

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        setErr(null);
        await load();
      } catch (e: unknown) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    setConditionsJson(defaultConditions[triggerType]);
  }, [triggerType]);

  async function createRule() {
    setErr(null);
    setMsg(null);
    if (meRole !== "admin" && meRole !== "manager") {
      setErr("Only admin or manager can create rules.");
      return;
    }
    let conditions: Record<string, unknown>;
    let actions: unknown;
    try {
      conditions = JSON.parse(conditionsJson) as Record<string, unknown>;
    } catch {
      setErr("Conditions must be valid JSON.");
      return;
    }
    try {
      actions = JSON.parse(actionsJson);
    } catch {
      setErr("Actions must be valid JSON.");
      return;
    }

    const res = await fetch(`${API_BASE}/api/automation/rules`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name: name.trim(),
        enabled: true,
        trigger_type: triggerType,
        conditions,
        actions,
      }),
    });
    if (!res.ok) {
      setErr(await apiErrorMessage(res));
      return;
    }
    setMsg("Rule created.");
    setName("My rule");
    await load();
  }

  const canManage = meRole === "admin" || meRole === "manager";

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Automation rules</h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>
        Triggers: <b>inactivity</b> (Celery scan), <b>stage_changed</b>, <b>message_received</b>. Actions include{" "}
        <code style={{ fontSize: 12 }}>assign_conversation</code>, <code style={{ fontSize: 12 }}>assign_lead</code>,{" "}
        <code style={{ fontSize: 12 }}>realtime_notify</code>.
      </p>
      {loading && <p>Loading…</p>}
      {err && <p style={{ color: "#fca5a5" }}>{err}</p>}
      {msg && <p style={{ color: "#86efac" }}>{msg}</p>}

      {canManage && (
        <div
          style={{
            marginBottom: 28,
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0 }}>New rule</h2>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} style={field} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Trigger type
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as typeof triggerType)} style={fieldSelect}>
              <option value="inactivity">inactivity</option>
              <option value="stage_changed">stage_changed</option>
              <option value="message_received">message_received</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Conditions (JSON)
            <textarea value={conditionsJson} onChange={(e) => setConditionsJson(e.target.value)} rows={8} style={fieldTa} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Actions (JSON array or object)
            <textarea value={actionsJson} onChange={(e) => setActionsJson(e.target.value)} rows={10} style={fieldTa} />
          </label>
          <button type="button" onClick={createRule} style={btnPrimary}>
            Create rule
          </button>
        </div>
      )}

      <h2 style={{ fontSize: 16 }}>Existing rules ({rules.length})</h2>
      <ul style={{ paddingLeft: 18, opacity: 0.95 }}>
        {rules.map((r) => (
          <li key={r.id} style={{ marginBottom: 10 }}>
            <b>{r.name}</b> · {r.trigger_type} · {r.enabled ? "on" : "off"}
            <pre style={{ fontSize: 11, opacity: 0.8, overflow: "auto", maxHeight: 120 }}>{JSON.stringify({ conditions: r.conditions, actions: r.actions }, null, 2)}</pre>
          </li>
        ))}
      </ul>
      {!rules.length && !loading && <p style={{ opacity: 0.7 }}>No rules yet.</p>}
    </Layout>
  );
}

const field: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "inherit",
};

const fieldSelect: React.CSSProperties = { ...field, background: "#111827" };

const fieldTa: React.CSSProperties = {
  ...field,
  fontFamily: "ui-monospace, monospace",
  fontSize: 12,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
  color: "white",
  cursor: "pointer",
  alignSelf: "flex-start",
};
