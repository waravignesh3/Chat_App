import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    receiver: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    text: {
      type: String,
      default: null,
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    mediaType: {
      type: String,
      enum: ["image", "video", null],
      default: null,
    },
    filename: {
      type: String,
      default: null,
    },
    time: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// Index for fast conversation lookups
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ receiver: 1, sender: 1 });

export default mongoose.model("Message", messageSchema);
