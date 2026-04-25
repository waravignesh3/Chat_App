import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import authroutes from "./authroutes.js";
import User from "./models/user.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

// 🔥 IMPORTANT: store online users
const onlineUsers = {};

// 🌍 FIX: allow frontend (Vercel) explicitly

// ✅ FIXED CORS
app.use(cors({
  origin: "https://chat-app-kappa-blush-85.vercel.app",
  credentials: true
}));

app.use(express.json());
app.use("/api", authroutes);

// 🔥 FIX: MongoDB better production config
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("DB error:", err));

// ================= SOCKET.IO FIX =================
const io = new Server(server, {
  cors: {
    origin: "https://chat-app-kappa-blush-85.vercel.app",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ================= HELPERS =================
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

// ================= ROUTES =================
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
    }

    await user.save();

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      photo: user.photo,
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
    res.json(users);
  } catch (error) {
    console.error("Fetch users error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= SOCKET LOGIC =================
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
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) {
      io.to(targetSocketId).emit("private_message", message);
    }
  });

  socket.on("disconnect", async () => {
    const email = Object.keys(onlineUsers).find(
      (e) => onlineUsers[e] === socket.id
    );

    if (email) {
      delete onlineUsers[email];

      await User.findOneAndUpdate(
        { email },
        {
          isOnline: false,
          lastSeen: new Date().toLocaleString(),
        }
      );

      await broadcastUsers();
    }
  });
});

// ================= FIXED PORT (IMPORTANT FOR RENDER) =================
const PORT = process.env.PORT || 5000;

// ❌ DO NOT use 0.0.0.0 manually on Render
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});