import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import pool, { hasDatabaseConfig } from "./db.js";
import authroutes from "./authroutes.js";
import logger from "./utils/logger.js"; // FIX: was ./logger.js

dotenv.config();

const app    = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_URLS || "http://localhost:5173")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

// email → socket.id map for online presence
const onlineUsers = {};

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.use(express.json());
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use("/api", authroutes);

/* ─── Database health ───────────────────────────────────────────── */
let dbHealthy = false;

const testDatabaseConnection = async () => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    if (!dbHealthy) logger.info("MySQL Database connected successfully");
    dbHealthy = true;
  } catch (error) {
    dbHealthy = false;
    logger.error(
      `MySQL connection failed: code=${error.code} errno=${error.errno} msg=${error.message} host=${
        error.address || process.env.DB_HOST || "from DATABASE_URL"
      }`
    );
    if (hasDatabaseConfig) setTimeout(testDatabaseConnection, 5000);
  }
};

if (hasDatabaseConfig) {
  testDatabaseConnection();
} else {
  logger.warn(
    "No database configuration found. Set DATABASE_URL or DB_HOST/DB_USER/DB_NAME/DB_PASSWORD. Running in degraded mode."
  );
}

/* ─── Health endpoint ───────────────────────────────────────────── */
app.get("/health", (_req, res) => {
  res.json({
    status:          dbHealthy ? "healthy" : "degraded",
    database:        dbHealthy ? "connected" : "disconnected",
    hasDatabaseConfig,
    configSource:    process.env.DATABASE_URL
      ? "DATABASE_URL"
      : process.env.DB_HOST
      ? `DB_HOST=${process.env.DB_HOST} DB_NAME=${process.env.DB_NAME} DB_USER=${process.env.DB_USER}`
      : "none",
    timestamp:       new Date().toISOString(),
  });
});

/* ─── Helpers ───────────────────────────────────────────────────── */
const buildUsersPayload = async () => {
  if (!dbHealthy) return [];
  try {
    const [users] = await pool.query(
      "SELECT id, name, email, photo, lastSeen, isOnline FROM users"
    );
    return users.map((u) => ({
      ...u,
      isOnline: Boolean(onlineUsers[u.email]),
      lastSeen: onlineUsers[u.email] ? "Online" : u.lastSeen || "Offline",
    }));
  } catch (error) {
    logger.error("Failed to build users payload:", error.message);
    return [];
  }
};

const broadcastUsers = async () => {
  const users = await buildUsersPayload();
  io.emit("users_update", users);
};

/* ─── Google login ──────────────────────────────────────────────── */
app.post("/api/google-login", async (req, res) => {
  const { name, email, photo } = req.body;

  try {
    if (!dbHealthy) {
      return res.status(503).json({ error: "Database service unavailable. Please try again later." });
    }
    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const [users] = await pool.query(
      "SELECT * FROM users WHERE LOWER(email) = ?",
      [normalizedEmail]
    );

    let user;
    if (users.length === 0) {
      const [result] = await pool.query(
        "INSERT INTO users (name, email, photo, provider, lastSeen, isOnline) VALUES (?, ?, ?, 'google', 'Offline', false)",
        [name, normalizedEmail, photo]
      );
      user = {
        id:       result.insertId,
        name,
        email:    normalizedEmail,
        photo,
        provider: "google",
        lastSeen: "Offline",
        isOnline: false,
      };
    } else {
      user = users[0];
      await pool.query(
        "UPDATE users SET name = ?, photo = ?, provider = 'google' WHERE LOWER(email) = ?",
        [name, photo || user.photo, normalizedEmail]
      );
      user.name     = name;
      user.photo    = photo || user.photo;
      user.provider = "google";
    }

    return res.json({
      success: true,
      user: {
        id:       user.id,
        name:     user.name,
        email:    user.email,
        photo:    user.photo,
        provider: user.provider,
        lastSeen: user.lastSeen || "Offline",
        isOnline: Boolean(onlineUsers[user.email]),
      },
    });
  } catch (error) {
    logger.error("Google login error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* ─── Users list ────────────────────────────────────────────────── */
app.get("/api/users", async (_req, res) => {
  if (!dbHealthy) {
    return res.status(503).json({ error: "Database service unavailable." });
  }
  try {
    const users = await buildUsersPayload();
    return res.json(users);
  } catch (error) {
    logger.error("Failed to fetch users:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* ─── Socket.IO ─────────────────────────────────────────────────── */
io.on("connection", (socket) => {
  logger.debug("User connected", { socketId: socket.id });

  socket.on("register", async (email) => {
    if (!email) return;
    const normalizedEmail = email.toLowerCase().trim();
    onlineUsers[normalizedEmail] = socket.id;

    if (dbHealthy) {
      try {
        await pool.query(
          "UPDATE users SET isOnline = true, lastSeen = 'Online' WHERE LOWER(email) = ?",
          [normalizedEmail]
        );
      } catch (error) {
        logger.error("Failed to update online status:", error.message);
      }
    }
    await broadcastUsers();
  });

  socket.on("typing", ({ to, from }) => {
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) {
      io.to(targetSocketId).emit("typing", { from });
    }
  });

  socket.on("stop_typing", ({ to, from }) => {
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) {
      io.to(targetSocketId).emit("stop_typing", { from });
    }
  });

  socket.on("private_message", ({ to, message }) => {
    const normalizedRecipient = to?.toLowerCase().trim();
    const targetSocketId = onlineUsers[normalizedRecipient];
    if (targetSocketId) {
      io.to(targetSocketId).emit("private_message", message);
    }
  });

  socket.on("disconnect", async () => {
    const email = Object.keys(onlineUsers).find(
      (key) => onlineUsers[key] === socket.id
    );
    if (email) {
      delete onlineUsers[email];
      if (dbHealthy) {
        try {
          // FIX: lastSeen is VARCHAR — store human-readable string, not ISO timestamp
          const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          await pool.query(
            "UPDATE users SET isOnline = false, lastSeen = ? WHERE LOWER(email) = ?",
            [now, email]
          );
        } catch (error) {
          logger.error("Failed to update offline status:", error.message);
        }
      }
      await broadcastUsers();
    }
  });
});

/* ─── Start ─────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});