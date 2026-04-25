import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import pool from "./db.js";
import authroutes from "./authroutes.js";

const app = express();
const server = http.createServer(app);

const allowedOrigins = ["http://localhost:5173", "http://localhost:5174"];
const onlineUsers = {};

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: allowedOrigins,
  })
);
app.use(express.json());

app.use("/api", authroutes);

// Test MySQL connection
pool.getConnection()
  .then((connection) => {
    connection.release();
    console.log("MySQL Database connected");
  })
  .catch((error) => {
    console.log("DB error:", error.message);
  });

const buildUsersPayload = async () => {
  const [users] = await pool.query(
    "SELECT id, name, email, photo, lastSeen, isOnline FROM users"
  );

  return users.map((user) => ({
    ...user,
    isOnline: Boolean(onlineUsers[user.email]),
    lastSeen: onlineUsers[user.email] ? "Online" : user.lastSeen || "Offline",
  }));
};

const broadcastUsers = async () => {
  const users = await buildUsersPayload();
  io.emit("users_update", users);
};

app.post("/google-login", async (req, res) => {
  const { name, email, photo } = req.body;

  try {
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
    console.error("Google login error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/users", async (req, res) => {
  try {
    const users = await buildUsersPayload();
    return res.json(users);
  } catch (error) {
    console.error("Fetch users error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("register", async (email) => {
    if (!email) return;

    const normalizedEmail = email.toLowerCase().trim();
    onlineUsers[normalizedEmail] = socket.id;

    await pool.query(
      "UPDATE users SET isOnline = true, lastSeen = 'Online' WHERE LOWER(email) = ?",
      [normalizedEmail]
    );

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

      await pool.query(
        "UPDATE users SET isOnline = false, lastSeen = ? WHERE LOWER(email) = ?",
        [new Date().toISOString(), email]
      );

      await broadcastUsers();
    }
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
