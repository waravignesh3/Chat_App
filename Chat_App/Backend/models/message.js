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
      enum: ["image", "video", "audio", null],
      default: null,
    },
    filename: {
      type: String,
      default: null,
    },
    readBy: {
      type: [String],
      default: [],
    },
    time: {
      type: String,
      required: true,
    },
    replyTo: {
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      senderName: {
        type: String,
        default: null,
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
        default: null,
      },
    },
    // reactions: { "❤️": ["user@a.com", "user@b.com"], "😂": ["user@c.com"] }
    reactions: {
      type: Map,
      of: [String],  // array of user emails who reacted
      default: {},
    },
    // soft-delete: per-user list of emails who deleted this message
    deletedFor: {
      type: [String],
      default: [],
    },
    // pinned message support
    isPinned: {
      type: Boolean,
      default: false,
    },
    pinnedBy: {
      type: String,
      default: null,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for fast conversation lookups
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ receiver: 1, sender: 1 });
messageSchema.index({ isPinned: 1 });
messageSchema.index({ receiver: 1, createdAt: -1 });

export default mongoose.model("Message", messageSchema);
