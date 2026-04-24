import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import authroutes from "./authroutes.js";
import User from "./models/user.js";

const app = express();
const server = http.createServer(app);
const onlineUsers = {};

// ✅ FIX: Allow all origins so LAN devices can connect
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: "*" }));
app.use(express.json());

app.use("/api", authroutes);

mongoose
  .connect("mongodb://127.0.0.1:27017/chatapp")
  .then(() => console.log("Database connected"))
  .catch((error) => console.log("DB error:", error));

const buildUsersPayload = async () => {
  const users = await User.find({}, "name email photo lastSeen isOnline").lean();

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
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      user = new User({
        name,
        email: normalizedEmail,
        photo,
        provider: "google",
      });
    } else {
      user.name = name;
      user.photo = photo || user.photo;
      user.provider = "google";
    }

    await user.save();

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      photo: user.photo,
      provider: user.provider,
      lastSeen: user.lastSeen,
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

    await User.findOneAndUpdate(
      { email: normalizedEmail },
      { isOnline: true, lastSeen: "Online" }
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
    const disconnectedEmail = Object.keys(onlineUsers).find(
      (email) => onlineUsers[email] === socket.id
    );

    if (disconnectedEmail) {
      delete onlineUsers[disconnectedEmail];

      await User.findOneAndUpdate(
        { email: disconnectedEmail },
        {
          isOnline: false,
          lastSeen: new Date().toLocaleString(),
        }
      );

      await broadcastUsers();
    }
  });
});

const PORT = 5000;
// ✅ FIX: Bind to 0.0.0.0 so LAN devices can reach the server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`LAN access: http://<your-local-ip>:${PORT}`);
});