import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Redis from "ioredis";

const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const PORT = parseInt(process.env.PORT || process.env.REALTIME_PORT || "4001", 10);

function parseSocketCorsOrigin(): string | string[] {
  const multi = process.env.CORS_ORIGINS?.trim();
  if (multi) {
    const parts = multi.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return "http://localhost:3000";
    if (parts.length === 1) return parts[0];
    return parts;
  }
  const single = process.env.CORS_ORIGIN?.trim();
  if (single) return single;
  return "http://localhost:3000";
}

const appServer = createServer();

const io = new Server(appServer, {
  cors: {
    origin: parseSocketCorsOrigin(),
    credentials: true,
  },
});

const redisUrl = process.env.REDIS_URL || "redis://redis:6379/0";
const redisSubscriber = new Redis(redisUrl, { lazyConnect: true });

async function startRedisSubscription() {
  try {
    await redisSubscriber.connect();
    await redisSubscriber.subscribe("realtime:events");

    redisSubscriber.on("message", (channel: string, message: string) => {
      if (channel !== "realtime:events") return;
      try {
        const event = JSON.parse(message) as { type?: string; conversation_id?: string; org_id?: string };
        if (!event.type) return;

        if (event.conversation_id) {
          io.to(`conversation:${event.conversation_id}`).emit(event.type, event);
          return;
        }

        io.to(`org:${event.org_id}`).emit(event.type, event);
      } catch {
        // ignore malformed payloads
      }
    });
  } catch {
    // Realtime should still boot even if Redis is unavailable.
  }
}

startRedisSubscription();

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("UNAUTHENTICATED"));
    }

    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    const userId = decoded.sub;
    const orgId = decoded.org;

    if (!userId || !orgId) {
      return next(new Error("UNAUTHENTICATED"));
    }

    socket.data.userId = userId;
    socket.data.orgId = orgId;

    // Default rooms for permissions-scoped pushes.
    socket.join(`org:${orgId}`);
    socket.join(`user:${userId}`);

    return next();
  } catch {
    return next(new Error("UNAUTHENTICATED"));
  }
});

io.on("connection", (socket) => {
  socket.emit("ready", {
    userId: socket.data.userId,
    orgId: socket.data.orgId,
  });

  // Agents can subscribe to a conversation timeline room for efficient inbox updates.
  socket.on("subscribeConversation", (conversationId: string | number) => {
    if (!conversationId) return;
    socket.join(`conversation:${conversationId}`);
  });
});

appServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[realtime] listening on :${PORT}`);
});

