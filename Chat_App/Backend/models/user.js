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
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: String,
      default: "Offline",
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
