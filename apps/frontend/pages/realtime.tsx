import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { REALTIME_URL } from "../lib/api";

/** Loaded from CDN (see useEffect); avoids bundling socket.io-client. */
type IoFn = (
  url: string,
  opts?: { auth?: { token?: string }; transports?: string[] },
) => {
  id?: string;
  on: (ev: string, fn: (...args: unknown[]) => void) => void;
  onAny?: (fn: (event: string, ...args: unknown[]) => void) => void;
  removeAllListeners: () => void;
  disconnect: () => void;
};

declare global {
  interface Window {
    io?: IoFn;
  }
}

const SOCKET_IO_CDN = "https://cdn.socket.io/4.8.1/socket.io.min.js";

function loadSocketIoScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.io) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SOCKET_IO_CDN}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("socket.io script failed")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = SOCKET_IO_CDN;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load socket.io from CDN"));
    document.body.appendChild(s);
  });
}

export default function RealtimePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "error">("idle");
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  function push(line: string) {
    setLog((prev) => [...prev.slice(-80), `${new Date().toISOString().slice(11, 19)} ${line}`]);
  }

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    let socket: ReturnType<IoFn> | null = null;
    setErr(null);
    setStatus("connecting");
    push(`Loading client + connecting to ${REALTIME_URL}…`);

    let cancelled = false;

    loadSocketIoScript()
      .then(() => {
        if (cancelled) return;
        const io = window.io;
        if (!io) {
          setStatus("error");
          setErr("window.io missing after script load");
          return;
        }
        socket = io(REALTIME_URL, {
          auth: { token },
          transports: ["websocket", "polling"],
        });

        socket.on("connect", () => {
          setStatus("open");
          push(`Connected (id=${socket?.id || "?"})`);
        });

        socket.on("connect_error", (e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          setStatus("error");
          setErr(msg);
          push(`connect_error: ${msg}`);
        });

        socket.on("disconnect", (reason: unknown) => {
          push(`disconnect: ${String(reason)}`);
        });

        if (typeof socket.onAny === "function") {
          socket.onAny((event: string, ...args: unknown[]) => {
            if (event === "connect" || event === "disconnect") return;
            push(`event ${event}: ${JSON.stringify(args).slice(0, 400)}`);
          });
        }
      })
      .catch((e: unknown) => {
        setStatus("error");
        setErr((e as Error).message);
      });

    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [router]);

  return (
    <Layout>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Realtime (Socket.IO)</h1>
      <p style={{ opacity: 0.75, marginBottom: 12 }}>
        Uses JWT from localStorage. Target: <b>{REALTIME_URL}</b>. Set <code>NEXT_PUBLIC_REALTIME_URL</code> for a remote gateway. Client script:{" "}
        <a href={SOCKET_IO_CDN} style={{ textDecoration: "underline" }}>
          socket.io CDN
        </a>
        .
      </p>
      <p style={{ marginBottom: 12 }}>
        Status: <b>{status}</b>
      </p>
      {err && <p style={{ color: "#fca5a5" }}>{err}</p>}
      <pre
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          maxHeight: 420,
          overflow: "auto",
          fontSize: 12,
          lineHeight: 1.4,
        }}
      >
        {log.join("\n")}
      </pre>
    </Layout>
  );
}
