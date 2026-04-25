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
    photo: {
      type: String,
      default: "https://via.placeholder.com/150",
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
