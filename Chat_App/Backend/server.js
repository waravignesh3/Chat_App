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
      "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav",
    ];
    cb(allowed.includes(file.mimetype) ? null : new Error("Only images, videos and audio are allowed"), allowed.includes(file.mimetype));
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
  const users = await User.find({}, "name email photo lastSeen isOnline status").lean();
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;

  return users.map((u) => {
    let currentStatus = u.status || { text: "", mediaUrl: "", mediaType: "", createdAt: null };

    // Check if status is older than 1 day
    if (currentStatus.createdAt && (now - new Date(currentStatus.createdAt)) > oneDayMs) {
      currentStatus = { text: "", mediaUrl: "", mediaType: "", createdAt: null };
      // Proactively clear it in DB if expired (optional but good for cleanup)
      User.updateOne({ _id: u._id }, { $set: { status: currentStatus } }).exec().catch(err => console.error("Error clearing status:", err));
    }

    return {
      ...u,
      status: currentStatus,
      isOnline: Boolean(onlineUsers[u.email]),
      lastSeen: onlineUsers[u.email] ? "Online" : u.lastSeen || "Offline",
    };
  });
};

const broadcastUsers = async () => {
  const users = await buildUsersPayload();
  io.emit("users_update", users);
};

// ─── Serialize reactions Map → plain object for JSON ─────────────────────────
const serializeReactions = (reactionsMap) => {
  if (!reactionsMap) return {};
  if (reactionsMap instanceof Map) {
    const obj = {};
    for (const [k, v] of reactionsMap) obj[k] = v;
    return obj;
  }
  return reactionsMap;
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
    const email        = req.body.email.toLowerCase().trim();
    const filename     = `avatar_${email}_${Date.now()}`;

    const uploadStream = avatarBucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata:    { email },
    });

    await new Promise((resolve, reject) => {
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
      uploadStream.end(req.file.buffer);
    });

    const photoPath = `/api/avatar/${uploadStream.id}`;
    await User.findOneAndUpdate({ email }, { photo: photoPath });

    return res.json({ success: true, photo: photoPath });
  } catch (err) {
    console.error("Profile photo upload error:", err);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// ─── Status update ────────────────────────────────────────────────────────────
app.post("/api/status", upload.single("file"), async (req, res) => {
  try {
    const { email, text } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    if (mongoose.connection.readyState !== 1) await waitForDatabaseConnection();

    const normalizedEmail = email.toLowerCase().trim();
    let statusUpdate = { 
      text: text || "", 
      mediaUrl: "",
      mediaType: "",
      createdAt: new Date() 
    };

    if (req.file) {
      const mediaBucket = getMediaBucket();
      const filename = `status_${normalizedEmail}_${Date.now()}_${req.file.originalname}`;
      const uploadStream = mediaBucket.openUploadStream(filename, {
        contentType: req.file.mimetype,
        metadata: { email: normalizedEmail, type: "status" },
      });

      await new Promise((resolve, reject) => {
        uploadStream.on("finish", resolve);
        uploadStream.on("error", reject);
        uploadStream.end(req.file.buffer);
      });

      statusUpdate.mediaUrl = `/api/media/${uploadStream.id}`;
      statusUpdate.mediaType = req.file.mimetype.startsWith("video/") ? "video" : "image";
    }

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      { $set: { status: statusUpdate } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    // Broadcast update to all users
    await broadcastUsers();

    return res.json({ success: true, status: user.status });
  } catch (err) {
    console.error("Status update error:", err);
    return res.status(500).json({ error: "Failed to update status" });
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

// ─── Messages history ─────────────────────────────────────────────────────────
app.get("/api/messages/:email", async (req, res) => {
  try {
    const email = req.params.email?.toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (mongoose.connection.readyState !== 1) await waitForDatabaseConnection();
    const msgs = await Message.find({
      $or: [{ sender: email }, { receiver: email }],
      deletedFor: { $ne: email }, // exclude soft-deleted for this user
    })
      .sort({ createdAt: 1 })
      .lean();

    // Serialize reactions Map to plain object
    const serialized = msgs.map((m) => ({
      ...m,
      reactions: serializeReactions(m.reactions),
    }));
    return res.json(serialized);
  } catch (err) {
    console.error("Fetch messages error:", err);
    return res.status(500).json({ error: "Unable to fetch messages" });
  }
});

// ─── Toggle reaction on a message (MongoDB) ───────────────────────────────────
// POST /api/messages/:id/react  body: { emoji, userEmail }
// If the user already reacted with that emoji → remove it (toggle off)
// Otherwise → add it
app.post("/api/messages/:id/react", async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji, userEmail } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid message id" });
    if (!emoji || !userEmail) return res.status(400).json({ error: "emoji and userEmail are required" });
    if (mongoose.connection.readyState !== 1) await waitForDatabaseConnection();

    const email = userEmail.toLowerCase().trim();
    const msg   = await Message.findById(id);
    if (!msg) return res.status(404).json({ error: "Message not found" });

    const current = msg.reactions.get(emoji) || [];
    let updated;
    if (current.includes(email)) {
      // Toggle OFF — remove this user's reaction
      updated = current.filter((e) => e !== email);
    } else {
      // Toggle ON — add this user's reaction
      updated = [...current, email];
    }

    if (updated.length === 0) {
      msg.reactions.delete(emoji);
    } else {
      msg.reactions.set(emoji, updated);
    }

    await msg.save();

    return res.json({
      success: true,
      messageId: id,
      reactions: serializeReactions(msg.reactions),
    });
  } catch (err) {
    console.error("React error:", err);
    return res.status(500).json({ error: err.message || "React failed" });
  }
});

// ─── Soft-delete a message for a user ────────────────────────────────────────
// DELETE /api/messages/:id  body: { userEmail, deleteFor: "me" | "everyone" }
app.delete("/api/messages/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail, deleteFor = "me" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid message id" });
    if (!userEmail) return res.status(400).json({ error: "userEmail is required" });
    if (mongoose.connection.readyState !== 1) await waitForDatabaseConnection();

    const email = userEmail.toLowerCase().trim();
    const msg   = await Message.findById(id);
    if (!msg) return res.status(404).json({ error: "Message not found" });

    if (deleteFor === "everyone" && msg.sender === email) {
      // Hard delete — only the sender can delete for everyone
      await Message.deleteOne({ _id: id });
      return res.json({ success: true, deletedFor: "everyone", messageId: id });
    } else {
      // Soft delete — just for this user
      if (!msg.deletedFor.includes(email)) {
        msg.deletedFor.push(email);
        await msg.save();
      }
      return res.json({ success: true, deletedFor: "me", messageId: id });
    }
  } catch (err) {
    console.error("Delete message error:", err);
    return res.status(500).json({ error: err.message || "Delete failed" });
  }
});

// ─── Pin / Unpin a message ────────────────────────────────────────────────────
// POST /api/messages/:id/pin  body: { userEmail, pin: true|false }
app.post("/api/messages/:id/pin", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail, pin = true } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid message id" });
    if (!userEmail) return res.status(400).json({ error: "userEmail is required" });
    if (mongoose.connection.readyState !== 1) await waitForDatabaseConnection();

    const email = userEmail.toLowerCase().trim();
    const update = pin
      ? { isPinned: true, pinnedBy: email, pinnedAt: new Date() }
      : { isPinned: false, pinnedBy: null, pinnedAt: null };

    const msg = await Message.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!msg) return res.status(404).json({ error: "Message not found" });

    return res.json({ success: true, messageId: id, isPinned: msg.isPinned });
  } catch (err) {
    console.error("Pin message error:", err);
    return res.status(500).json({ error: err.message || "Pin failed" });
  }
});

// ─── Get pinned messages for a conversation ───────────────────────────────────
app.get("/api/messages/pinned/:userA/:userB", async (req, res) => {
  try {
    const a = req.params.userA?.toLowerCase().trim();
    const b = req.params.userB?.toLowerCase().trim();
    if (!a || !b) return res.status(400).json({ error: "Both user emails required" });
    if (mongoose.connection.readyState !== 1) await waitForDatabaseConnection();

    const msgs = await Message.find({
      $or: [
        { sender: a, receiver: b },
        { sender: b, receiver: a },
      ],
      isPinned: true,
    })
      .sort({ pinnedAt: -1 })
      .lean();

    return res.json(msgs.map((m) => ({ ...m, reactions: serializeReactions(m.reactions) })));
  } catch (err) {
    console.error("Pinned messages error:", err);
    return res.status(500).json({ error: "Unable to fetch pinned messages" });
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

    // Persist the message to MongoDB first, get the _id back
    let savedMsg = null;
    try {
      const doc = await Message.create({
        sender:    message.sender?.toLowerCase().trim(),
        receiver:  message.receiver?.toLowerCase().trim(),
        text:      message.text    || null,
        mediaUrl:  message.mediaUrl  || null,
        mediaType: message.mediaType || null,
        filename:  message.filename  || null,
        readBy:    [message.sender?.toLowerCase().trim()].filter(Boolean),
        time:      message.time,
        replyTo:   message.replyTo
          ? {
              messageId:  message.replyTo.messageId || null,
              senderName: message.replyTo.senderName || null,
              text:       message.replyTo.text       || null,
              mediaUrl:   message.replyTo.mediaUrl   || null,
              mediaType:  message.replyTo.mediaType  || null,
            }
          : undefined,
      });
      savedMsg = {
        ...message,
        _id: doc._id.toString(),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        reactions: {},
        isPinned: false,
      };
    } catch (err) {
      console.error("Failed to save message:", err.message);
      savedMsg = message; // fallback: send without DB id
    }

    // Emit to recipient with DB _id so reactions/delete can reference it
    if (targetSocketId) io.to(targetSocketId).emit("private_message", savedMsg);
    // Echo back to sender with _id
    socket.emit("message_saved", savedMsg);
  });

  socket.on("typing", ({ to, from }) => {
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) io.to(targetSocketId).emit("typing", { from });
  });

  socket.on("stop_typing", ({ to, from }) => {
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) io.to(targetSocketId).emit("stop_typing", { from });
  });

  // ── Read receipts ──────────────────────────────────────────────────────────
  socket.on("read_receipt", ({ to, from }) => {
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    const senderEmail = to?.toLowerCase().trim();
    const readerEmail = from?.toLowerCase().trim();

    if (senderEmail && readerEmail) {
      Message.updateMany(
        {
          sender: senderEmail,
          receiver: readerEmail,
          deletedFor: { $ne: readerEmail },
          readBy: { $ne: readerEmail },
        },
        { $addToSet: { readBy: readerEmail } }
      ).catch((err) => {
        console.error("Read receipt persist error:", err.message);
      });
    }

    if (targetSocketId) io.to(targetSocketId).emit("read_receipt", { from });
  });

  // ── Message reactions — toggle and persist to MongoDB ─────────────────────
  socket.on("message_reaction", async ({ to, messageId, emoji, by }) => {
    if (!messageId || !emoji || !by) return;

    try {
      if (mongoose.connection.readyState !== 1) return;
      const email = by.toLowerCase().trim();
      const msg   = await Message.findById(messageId);
      if (!msg) return;

      const current = msg.reactions.get(emoji) || [];
      let updated;
      let action; // "added" | "removed"
      if (current.includes(email)) {
        updated = current.filter((e) => e !== email);
        action  = "removed";
      } else {
        updated = [...current, email];
        action  = "added";
      }

      if (updated.length === 0) {
        msg.reactions.delete(emoji);
      } else {
        msg.reactions.set(emoji, updated);
      }

      await msg.save();

      const reactionPayload = {
        messageId,
        emoji,
        by: email,
        action,
        reactions: serializeReactions(msg.reactions),
      };

      // Notify the target user
      const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
      if (targetSocketId) io.to(targetSocketId).emit("message_reaction", reactionPayload);
      // Echo updated state back to sender
      socket.emit("message_reaction", reactionPayload);
    } catch (err) {
      console.error("Reaction persist error:", err.message);
    }
  });

  // ── Message deleted ────────────────────────────────────────────────────────
  socket.on("message_deleted", ({ to, messageId, deletedFor, by }) => {
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) io.to(targetSocketId).emit("message_deleted", { messageId, deletedFor, by });
  });

  // ── Message pinned / unpinned ──────────────────────────────────────────────
  socket.on("message_pinned", ({ to, messageId, isPinned, by }) => {
    const targetSocketId = onlineUsers[to?.toLowerCase().trim()];
    if (targetSocketId) io.to(targetSocketId).emit("message_pinned", { messageId, isPinned, by });
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
