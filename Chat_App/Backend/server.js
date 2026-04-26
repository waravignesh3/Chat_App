import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";
import multer from "multer";
import { GridFSBucket } from "mongodb";
import authroutes from "./authroutes.js";
import User from "./models/user.js";
import Message from "./models/message.js";

dotenv.config();

const app    = express();
const server = http.createServer(app);
const onlineUsers = {};

const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || "")
  .split(",")
  .map((o) => o.trim())
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

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use("/api", authroutes);

// ─── GridFS buckets (lazy — created on first use after DB connects) ───────────
let _mediaBucket;
let _avatarBucket;

function getMediaBucket() {
  if (!_mediaBucket) {
    if (mongoose.connection.readyState !== 1)
      throw new Error("Database not ready — please try again in a moment");
    _mediaBucket = new GridFSBucket(mongoose.connection.db, { bucketName: "media" });
  }
  return _mediaBucket;
}

function getAvatarBucket() {
  if (!_avatarBucket) {
    if (mongoose.connection.readyState !== 1)
      throw new Error("Database not ready — please try again in a moment");
    _avatarBucket = new GridFSBucket(mongoose.connection.db, { bucketName: "avatars" });
  }
  return _avatarBucket;
}

mongoose
  .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => {
    console.log("MongoDB Connected");
    // Pre-warm the buckets so they are ready immediately after connection
    _mediaBucket  = new GridFSBucket(mongoose.connection.db, { bucketName: "media" });
    _avatarBucket = new GridFSBucket(mongoose.connection.db, { bucketName: "avatars" });
  })
  .catch((err) => console.log("DB error:", err));

// ─── Multer — memory storage ──────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter(_req, file, cb) {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "video/mp4", "video/webm", "video/ogg", "video/quicktime",
    ];
    cb(allowed.includes(file.mimetype) ? null : new Error("Only images and videos are allowed"), allowed.includes(file.mimetype));
  },
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    cb(file.mimetype.startsWith("image/") ? null : new Error("Only images allowed for profile photo"), file.mimetype.startsWith("image/"));
  },
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { ...corsOptions, methods: ["GET", "POST"] },
  maxHttpBufferSize: 100 * 1024 * 1024,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const waitForDatabaseConnection = (timeoutMs = 12000) =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) { resolve(); return; }
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Database connection timed out")); }, timeoutMs);
    const handleConnected = () => { cleanup(); resolve(); };
    const handleError     = (err) => { cleanup(); reject(err); };
    const cleanup = () => {
      clearTimeout(timeout);
      mongoose.connection.off("connected", handleConnected);
      mongoose.connection.off("error", handleError);
    };
    mongoose.connection.on("connected", handleConnected);
    mongoose.connection.on("error", handleError);
  });

const buildUsersPayload = async () => {
  const users = await User.find({}, "name email photo lastSeen isOnline").lean();
  return users.map((u) => ({
    ...u,
    isOnline: Boolean(onlineUsers[u.email]),
    lastSeen: onlineUsers[u.email] ? "Online" : u.lastSeen || "Offline",
  }));
};

const broadcastUsers = async () => {
  const users = await buildUsersPayload();
  io.emit("users_update", users);
};

// ─── Google login ─────────────────────────────────────────────────────────────
const handleGoogleLogin = async (req, res) => {
  const { name, email, photo } = req.body;
  try {
    if (mongoose.connection.readyState !== 1) await waitForDatabaseConnection();
    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedName  = (name || normalizedEmail.split("@")[0] || "User").trim();
    const normalizedPhoto = typeof photo === "string" && photo.trim() ? photo.trim() : undefined;

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: { name: normalizedName, provider: "google", ...(normalizedPhoto ? { photo: normalizedPhoto } : {}) },
        $setOnInsert: { email: normalizedEmail, password: null, lastSeen: "Offline", isOnline: false },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      user: {
        _id: user._id, name: user.name, email: user.email, photo: user.photo,
        provider: user.provider,
        isOnline: Boolean(onlineUsers[user.email]),
        lastSeen: onlineUsers[user.email] ? "Online" : user.lastSeen || "Offline",
      },
    });
  } catch (error) {
    console.error("Google login error:", error);
    if (error.code === 11000) return res.status(409).json({ error: "An account with this email already exists." });
    return res.status(500).json({ error: error.message || "Server error" });
  }
};

app.post("/google-login",     handleGoogleLogin);
app.post("/api/google-login", handleGoogleLogin);

// ─── Users ────────────────────────────────────────────────────────────────────
app.get("/users", async (req, res) => {
  try { return res.json(await buildUsersPayload()); }
  catch (err) { return res.status(500).json({ error: "Server error" }); }
});

app.get("/api/users", async (req, res) => {
  try { return res.json(await buildUsersPayload()); }
  catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    success: true, message: "Server is healthy",
    database: mongoose.connection.readyState === 1 ? "connected"
            : mongoose.connection.readyState === 2 ? "connecting" : "disconnected",
  });
});

// ─── Profile photo upload ─────────────────────────────────────────────────────
app.post("/api/profile/photo", avatarUpload.single("photo"), async (req, res) => {
  try {
    if (!req.file)        return res.status(400).json({ error: "No file uploaded" });
    if (!req.body.email)  return res.status(400).json({ error: "Email is required" });

    if (mongoose.connection.readyState !== 1) await waitForDatabaseConnection();
    const avatarBucket = getAvatarBucket();

    const normalizedEmail = req.body.email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Delete old avatar from GridFS if it was stored by us
    if (user.photo && user.photo.includes("/api/avatar/")) {
      try {
        const oldId = user.photo.split("/api/avatar/")[1];
        if (oldId && mongoose.Types.ObjectId.isValid(oldId)) {
          await avatarBucket.delete(new mongoose.Types.ObjectId(oldId));
        }
      } catch (_) { /* ignore */ }
    }

    const uploadStream = avatarBucket.openUploadStream(
      `avatar_${normalizedEmail}_${Date.now()}`,
      { contentType: req.file.mimetype }
    );
    await new Promise((resolve, reject) => {
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
      uploadStream.end(req.file.buffer);
    });

    user.photo = `/api/avatar/${uploadStream.id}`;
    await user.save();
    await broadcastUsers();

    return res.json({ success: true, photo: user.photo });
  } catch (err) {
    console.error("Profile photo upload error:", err);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// ─── Serve avatar ─────────────────────────────────────────────────────────────
app.get("/api/avatar/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });
    const objectId     = new mongoose.Types.ObjectId(id);
    const avatarBucket = getAvatarBucket();
    const files = await avatarBucket.find({ _id: objectId }).toArray();
    if (!files.length) return res.status(404).json({ error: "Avatar not found" });
    res.set("Content-Type", files[0].contentType || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    avatarBucket.openDownloadStream(objectId).pipe(res);
  } catch (err) {
    console.error("Serve avatar error:", err);
    res.status(500).json({ error: "Unable to serve avatar" });
  }
});

// ─── Media upload (photos & videos up to 100 MB) ─────────────────────────────
app.post("/api/media/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file)              return res.status(400).json({ error: "No file uploaded" });
    if (!req.body.sender)       return res.status(400).json({ error: "sender is required" });
    if (!req.body.receiver)     return res.status(400).json({ error: "receiver is required" });

    if (mongoose.connection.readyState !== 1) await waitForDatabaseConnection();
    const mediaBucket = getMediaBucket();

    const { sender, receiver } = req.body;
    const safeOriginalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const filename = `media_${Date.now()}_${safeOriginalName}`;

    const uploadStream = mediaBucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata: { sender, receiver, originalName: safeOriginalName },
    });

    await new Promise((resolve, reject) => {
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
      uploadStream.end(req.file.buffer);
    });

    const isVideo  = req.file.mimetype.startsWith("video/");
    const mediaUrl = `/api/media/${uploadStream.id}`;

    return res.json({
      success:   true,
      mediaUrl,
      mediaType: isVideo ? "video" : "image",
      filename:  req.file.originalname,
      size:      req.file.size,
    });
  } catch (err) {
    console.error("Media upload error:", err);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// ─── Serve media ──────────────────────────────────────────────────────────────
app.get("/api/media/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

    const objectId    = new mongoose.Types.ObjectId(id);
    const mediaBucket = getMediaBucket();
    const files       = await mediaBucket.find({ _id: objectId }).toArray();
    if (!files.length) return res.status(404).json({ error: "Media not found" });

    const file        = files[0];
    const fileSize    = file.length;
    const contentType = file.contentType || "application/octet-stream";
    const range       = req.headers.range;

    if (range && contentType.startsWith("video/")) {
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start    = parseInt(startStr, 10);
      const end      = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range":  `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges":  "bytes",
        "Content-Length": chunkSize,
        "Content-Type":   contentType,
      });
      mediaBucket.openDownloadStream(objectId, { start, end: end + 1 }).pipe(res);
    } else {
      res.set("Content-Type",   contentType);
      res.set("Content-Length", fileSize);
      res.set("Accept-Ranges",  "bytes");
      res.set("Cache-Control",  "public, max-age=3600");
      mediaBucket.openDownloadStream(objectId).pipe(res);
    }
  } catch (err) {
    console.error("Serve media error:", err);
    res.status(500).json({ error: "Unable to serve media" });
  }
});

// ─── Socket.IO events ─────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("register", async (email) => {
    if (!email) return;
    const normalizedEmail = email.toLowerCase().trim();
    onlineUsers[normalizedEmail] = socket.id;
    await User.findOneAndUpdate({ email: normalizedEmail }, { isOnline: true, lastSeen: "Online" });
    await broadcastUsers();
  });

  socket.on("private_message", async ({ to, message }) => {
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) io.to(targetSocketId).emit("private_message", message);
    // Persist the message to MongoDB
    try {
      await Message.create({
        sender:    message.sender?.toLowerCase().trim(),
        receiver:  message.receiver?.toLowerCase().trim(),
        text:      message.text    || null,
        mediaUrl:  message.mediaUrl  || null,
        mediaType: message.mediaType || null,
        filename:  message.filename  || null,
        time:      message.time,
      });
    } catch (err) {
      console.error("Failed to save message:", err.message);
    }
  });

  socket.on("typing", ({ to, from }) => {
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) io.to(targetSocketId).emit("typing", { from });
  });

  socket.on("stop_typing", ({ to, from }) => {
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) io.to(targetSocketId).emit("stop_typing", { from });
  });

  socket.on("disconnect", async () => {
    const email = Object.keys(onlineUsers).find((e) => onlineUsers[e] === socket.id);
    if (email) {
      delete onlineUsers[email];
      await User.findOneAndUpdate({ email }, { isOnline: false, lastSeen: new Date().toISOString() });
      await broadcastUsers();
    }
  });
});

// ─── Messages history ────────────────────────────────────────────────────────
app.get("/api/messages/:email", async (req, res) => {
  try {
    const email = req.params.email?.toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (mongoose.connection.readyState !== 1) await waitForDatabaseConnection();
    const msgs = await Message.find({
      $or: [{ sender: email }, { receiver: email }],
    })
      .sort({ createdAt: 1 })
      .lean();
    return res.json(msgs);
  } catch (err) {
    console.error("Fetch messages error:", err);
    return res.status(500).json({ error: "Unable to fetch messages" });
  }
});

// ─── 404 / error handlers ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("UNHANDLED SERVER ERROR:", err);
  return res.status(500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });