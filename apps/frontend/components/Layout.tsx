import Link from "next/link";

const navLink = { opacity: 0.9 as const, textDecoration: "none" as const };

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          padding: "12px 24px",
          display: "flex",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
          rowGap: 10,
        }}
      >
        <Link href="/" style={{ fontWeight: 700, textDecoration: "none" }}>
          WaFlow
        </Link>
        <Link href="/" style={navLink}>
          Dashboard
        </Link>
        <Link href="/inbox" style={navLink}>
          Inbox
        </Link>
        <Link href="/pipeline" style={navLink}>
          Pipeline
        </Link>
        <Link href="/contacts" style={navLink}>
          Contacts
        </Link>
        <Link href="/automation" style={navLink}>
          Automation
        </Link>
        <Link href="/team" style={navLink}>
          Team
        </Link>
        <Link href="/whatsapp" style={navLink}>
          WhatsApp
        </Link>
        <Link href="/billing" style={navLink}>
          Billing
        </Link>
        <Link href="/realtime" style={navLink}>
          Realtime
        </Link>
        <Link href="/status" style={navLink}>
          API status
        </Link>
        <span style={{ flex: 1 }} />
        <Link
          href="/login"
          onClick={() => {
            if (typeof window !== "undefined") localStorage.removeItem("access_token");
          }}
          style={{ opacity: 0.65, fontSize: 13 }}
          title="Clears session then opens sign-in"
        >
          Log out
        </Link>
      </header>
      <main
        style={{
          padding: 24,
          flex: 1,
          maxWidth: 1200,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        {children}
      </main>
    </div>
  );
}
