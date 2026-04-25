import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import pool, { hasDatabaseConfig } from "./db.js";
import authroutes from "./authroutes.js";
import logger from "./utils/logger.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_URLS || "http://localhost:5173")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const onlineUsers = {};

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.use(express.json());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use("/api", authroutes);

// Database connection state
let dbHealthy = false;

const testDatabaseConnection = async () => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    dbHealthy = true;
    logger.info("MySQL Database connected successfully");
  } catch (error) {
    dbHealthy = false;
    logger.error("MySQL Database connection failed", error);
    if (hasDatabaseConfig) {
      // Retry after 5 seconds only when config exists
      setTimeout(testDatabaseConnection, 5000);
    }
  }
};

if (hasDatabaseConfig) {
  testDatabaseConnection();
} else {
  logger.warn("No database configuration found. Running in degraded mode.");
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: dbHealthy ? "healthy" : "degraded",
    database: dbHealthy ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

const buildUsersPayload = async () => {
  if (!dbHealthy) {
    logger.error("Database not available");
    return [];
  }
  
  try {
    const [users] = await pool.query(
      "SELECT id, name, email, photo, lastSeen, isOnline FROM users"
    );

    return users.map((user) => ({
      ...user,
      isOnline: Boolean(onlineUsers[user.email]),
      lastSeen: onlineUsers[user.email] ? "Online" : user.lastSeen || "Offline",
    }));
  } catch (error) {
    logger.error("Failed to build users payload", error);
    return [];
  }
};

const broadcastUsers = async () => {
  const users = await buildUsersPayload();
  io.emit("users_update", users);
};

app.post("/google-login", async (req, res) => {
  const { name, email, photo } = req.body;

  try {
    if (!dbHealthy) {
      return res.status(503).json({ error: "Database service unavailable. Please try again later." });
    }

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const [users] = await pool.query(
      "SELECT * FROM users WHERE LOWER(email) = ?",
      [normalizedEmail]
    );

    let user;
    if (users.length === 0) {
      // Create new user
      const [result] = await pool.query(
        "INSERT INTO users (name, email, photo, provider, lastSeen, isOnline) VALUES (?, ?, ?, 'google', 'Offline', false)",
        [name, normalizedEmail, photo]
      );
      user = { id: result.insertId, name, email: normalizedEmail, photo, provider: "google" };
    } else {
      // Update existing user
      user = users[0];
      await pool.query(
        "UPDATE users SET name = ?, photo = ?, provider = 'google' WHERE LOWER(email) = ?",
        [name, photo || user.photo, normalizedEmail]
      );
      user.name = name;
      user.photo = photo || user.photo;
      user.provider = "google";
    }

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      photo: user.photo,
      provider: user.provider,
      lastSeen: user.lastSeen || "Offline",
      isOnline: Boolean(onlineUsers[user.email]),
    });
  } catch (error) {
    logger.error("Google login error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/users", async (req, res) => {
  try {
    const users = await buildUsersPayload();
    return res.json(users);
  } catch (error) {
    logger.error("Failed to fetch users", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

io.on("connection", (socket) => {
  logger.debug("User connected", { socketId: socket.id });

  socket.on("register", async (email) => {
    if (!email) return;

    const normalizedEmail = email.toLowerCase().trim();
    onlineUsers[normalizedEmail] = socket.id;

    if (dbHealthy) {
      await pool.query(
        "UPDATE users SET isOnline = true, lastSeen = 'Online' WHERE LOWER(email) = ?",
        [normalizedEmail]
      );
    }

    await broadcastUsers();
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
      (email) => onlineUsers[email] === socket.id
    );

    if (email) {
      delete onlineUsers[email];

      if (dbHealthy) {
        await pool.query(
          "UPDATE users SET isOnline = false, lastSeen = ? WHERE LOWER(email) = ?",
          [new Date().toISOString(), email]
        );
      }

      await broadcastUsers();
    }
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
