import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";
import authroutes from "./authroutes.js";
import User from "./models/user.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const onlineUsers = {};

const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use("/api", authroutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((error) => console.log("DB error:", error));

const io = new Server(server, {
  cors: {
    ...corsOptions,
    methods: ["GET", "POST"],
  },
});

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

const handleGoogleLogin = async (req, res) => {
  const { name, email, photo } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedName = (name || normalizedEmail.split("@")[0] || "User").trim();
    const normalizedPhoto = typeof photo === "string" && photo.trim() ? photo.trim() : undefined;

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: {
          name: normalizedName,
          provider: "google",
          ...(normalizedPhoto ? { photo: normalizedPhoto } : {}),
        },
        $setOnInsert: {
          email: normalizedEmail,
          password: null,
          lastSeen: "Offline",
          isOnline: false,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        photo: user.photo,
        provider: user.provider,
        isOnline: Boolean(onlineUsers[user.email]),
        lastSeen: onlineUsers[user.email] ? "Online" : user.lastSeen || "Offline",
      },
    });
  } catch (error) {
    console.error("Google login error:", error);

    if (error.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    return res.status(500).json({
      error: error.message || "Server error",
    });
  }
};

app.post("/google-login", handleGoogleLogin);
app.post("/api/google-login", handleGoogleLogin);

app.get("/users", async (req, res) => {
  try {
    const users = await buildUsersPayload();
    return res.json(users);
  } catch (error) {
    console.error("Fetch users error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await buildUsersPayload();
    return res.json(users);
  } catch (error) {
    console.error("Fetch users error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is healthy" });
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
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) {
      io.to(targetSocketId).emit("private_message", message);
    }
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

  socket.on("disconnect", async () => {
    const email = Object.keys(onlineUsers).find((entry) => onlineUsers[entry] === socket.id);

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

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
