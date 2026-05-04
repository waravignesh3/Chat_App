import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      default: null,
      select: false,
    },
    // NEW: default null so the frontend Avatar component renders the
    // first-letter coloured circle for new / manual-login users.
    // Google users get their photoURL stored here automatically.
    photo: {
      type: String,
      default: null,
    },
    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    bio: {
      type: String,
      default: "Available for messages",
      trim: true,
      maxlength: 160,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: String,
      default: "Offline",
    },
    status: {
      text: { type: String, default: "" },
      mediaUrl: { type: String, default: "" },
      mediaType: { type: String, default: "" },
      createdAt: { type: Date, default: null },
      likes: { type: [String], default: [] },
    },
    privacy: {
      lastSeen: {
        type: String,
        enum: ["everyone", "contacts", "nobody"],
        default: "everyone",
      },
      profilePhoto: {
        type: String,
        enum: ["everyone", "contacts", "nobody"],
        default: "everyone",
      },
      readReceipts: {
        type: Boolean,
        default: true,
      },
    },
    notifications: {
      messagePreview: {
        type: Boolean,
        default: true,
      },
      sound: {
        type: Boolean,
        default: true,
      },
      vibrate: {
        type: Boolean,
        default: true,
      },
      desktopAlerts: {
        type: Boolean,
        default: true,
      },
    },
    pinnedChats: {
      type: [String],
      default: [],
    },
    archivedChats: {
      type: [String],
      default: [],
    },
    blockedUsers: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
