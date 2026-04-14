import Link from "next/link";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          padding: "12px 24px",
          display: "flex",
          gap: 20,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ fontWeight: 700, textDecoration: "none" }}>
          WaFlow
        </Link>
        <Link href="/inbox" style={{ opacity: 0.9 }}>
          Inbox
        </Link>
        <Link href="/pipeline" style={{ opacity: 0.9 }}>
          Pipeline
        </Link>
        <Link href="/billing" style={{ opacity: 0.9 }}>
          Billing
        </Link>
        <span style={{ flex: 1 }} />
      </header>
      <main style={{ padding: 24, flex: 1, maxWidth: 1200, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {children}
      </main>
    </div>
  );
}
