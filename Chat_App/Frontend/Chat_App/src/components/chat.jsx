import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { signOut } from "firebase/auth";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { parseJsonResponse } from "../utils/http";
import "../App.css";
import "../App.enhanced.css";
import "../chat.profile.css";
import "../chat.media.css";
import "../chat.unread.css";
import "../chat.bubble-fix.css";   // after App.enhanced.css
import "../chat.reactions.fix.css"; // after chat.bubble-fix.css

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");

// ─── Format lastSeen timestamp ────────────────────────────────────────────────
function formatLastSeen(raw) {
  if (!raw || raw === "Online" || raw === "Offline") return raw || "Offline";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return raw;
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  // Format: 27 Apr 2025
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Format message time ──────────────────────────────────────────────────────
function formatMsgTime(timeStr) {
  if (!timeStr) return "";
  // Already a short time string like "10:32 AM" — return as-is
  if (/^\d{1,2}:\d{2}/.test(timeStr)) return timeStr;
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return timeStr;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Date separator label ─────────────────────────────────────────────────────
function getDateLabel(timeStr) {
  if (!timeStr) return null;
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = today - msgDate;
  if (diff === 0) return "Today";
  if (diff === 86400000) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Avatar colours ───────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#4f46e5", "#0891b2", "#059669", "#d97706",
  "#dc2626", "#7c3aed", "#db2777", "#0284c7",
];

function hashColor(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name, email, photo, size = 44, className = "" }) {
  const initial = (name || email || "?")[0].toUpperCase();
  const bg = hashColor(name || email);
  if (photo) {
    return (
      <img
        src={photo}
        alt={name || email}
        className={className}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }}
        onError={(e) => {
          e.currentTarget.style.display = "none";
          const sibling = e.currentTarget.nextSibling;
          if (sibling) sibling.style.display = "flex";
        }}
      />
    );
  }
  return (
    <div
      className={className}
      style={{
        width: size, height: size, borderRadius: "50%",
        background: bg, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: size * 0.4,
        flexShrink: 0, userSelect: "none",
      }}
    >
      {initial}
    </div>
  );
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
const EMOJI_LIST = [
  "😀","😂","😍","🥰","😎","🤔","😢","😡","🥳","🤩",
  "👍","👎","❤️","🔥","✨","🎉","🙏","💯","😴","🤣",
  "😊","😇","🤗","😏","🙄","😤","😭","😱","🤯","🥺",
  "👋","🤝","💪","🫶","✌️","🤞","👀","💀","🎵","🚀",
  "🌟","💡","📸","🎮","🍕","☕","🌈","🌙","⚡","🎯",
];

const REACTION_EMOJIS = ["❤️","😂","👍","😮","😢","🔥"];

function EmojiPicker({ onSelect }) {
  return (
    <div className="emoji-picker-popover" role="dialog" aria-label="Emoji picker">
      <div className="emoji-picker-grid">
        {EMOJI_LIST.map((emoji) => (
          <button key={emoji} type="button" className="emoji-btn" onClick={() => onSelect(emoji)} aria-label={emoji}>
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Reaction Picker ──────────────────────────────────────────────────────────
function ReactionPicker({ onSelect, onClose }) {
  return (
    <div className="reaction-picker-popover">
      {REACTION_EMOJIS.map((e) => (
        <button key={e} type="button" className="reaction-picker-btn" onClick={() => { onSelect(e); onClose(); }}>
          {e}
        </button>
      ))}
    </div>
  );
}

// ─── Profile Photo Modal ──────────────────────────────────────────────────────
function ProfilePhotoModal({ user, onClose, onPhotoUpdated }) {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError("Only image files are allowed."); return; }
    if (f.size > 5 * 1024 * 1024) { setError("Image must be under 5 MB."); return; }
    setError("");
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("email", user.email);
      formData.append("photo", file);
      const res = await fetch(`${SERVER_URL}/api/profile/photo`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onPhotoUpdated(`${SERVER_URL}${data.photo}`);
      onClose();
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <h3>Update Profile Photo</h3>
          <button type="button" className="profile-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="profile-modal-body">
          <div className="profile-preview-wrap">
            {preview
              ? <img src={preview} alt="Preview" className="profile-preview-img" />
              : <Avatar name={user?.name} email={user?.email} photo={user?.photo} size={100} />}
          </div>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
          <button type="button" className="profile-pick-btn" onClick={() => inputRef.current?.click()}>
            Choose Photo
          </button>
          {error && <p className="profile-error">{error}</p>}
        </div>
        <div className="profile-modal-footer">
          <button type="button" className="profile-cancel-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="profile-upload-btn" onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? "Uploading…" : "Save Photo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Media Message ────────────────────────────────────────────────────────────
function MediaMessage({ mediaUrl, mediaType }) {
  const absoluteUrl = mediaUrl.startsWith("http") ? mediaUrl : `${SERVER_URL}${mediaUrl}`;
  if (mediaType === "video") {
    return <video src={absoluteUrl} controls className="chat-media-video" preload="metadata" />;
  }
  return (
    <a href={absoluteUrl} target="_blank" rel="noopener noreferrer">
      <img src={absoluteUrl} alt="shared" className="chat-media-image" />
    </a>
  );
}

// ─── Message Search Modal ─────────────────────────────────────────────────────
function MessageSearchModal({ messages, user, selectedUser, onClose, onJump }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return messages
      .filter((m) => m.text && m.text.toLowerCase().includes(q))
      .slice(-30)
      .reverse();
  }, [query, messages]);

  return (
    <div className="msg-search-overlay" onClick={onClose}>
      <div className="msg-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="msg-search-header">
          <span>🔍 Search Messages</span>
          <button className="profile-modal-close" onClick={onClose}>✕</button>
        </div>
        <input
          ref={inputRef}
          className="msg-search-input"
          placeholder={`Search in chat with ${selectedUser?.name || selectedUser?.email || "…"}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="msg-search-results">
          {query.trim() && results.length === 0 && (
            <p className="msg-search-empty">No messages found for "{query}"</p>
          )}
          {results.map((m, i) => (
            <button
              key={i}
              className="msg-search-result-item"
              onClick={() => { onJump(m); onClose(); }}
            >
              <span className="msg-search-sender">
                {m.sender === user?.email ? "You" : selectedUser?.name || selectedUser?.email}
              </span>
              <span className="msg-search-text">
                {m.text.replace(new RegExp(`(${query})`, "gi"), "|||$1|||").split("|||").map((part, idx) =>
                  part.toLowerCase() === query.toLowerCase()
                    ? <mark key={idx}>{part}</mark>
                    : part
                )}
              </span>
              <span className="msg-search-time">{m.time}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function Chat({ user, setUser }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [highlightedMsgIndex, setHighlightedMsgIndex] = useState(null);
  // reactions: { [msgKey]: { [emoji]: count } }
  const [reactions, setReactions] = useState({});
  const [reactionPickerFor, setReactionPickerFor] = useState(null); // msgKey
  // read receipts: Set of msgKeys seen by remote
  const [readBy, setReadBy] = useState(new Set());
  const [connectionStatus, setConnectionStatus] = useState("connecting"); // connecting | online | offline
  const [unreadMap, setUnreadMap] = useState(() => {
    try {
      const raw = localStorage.getItem(`chatapp-unread||${user?.email}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [flashEmail, setFlashEmail] = useState(null);
  const [recentOrder, setRecentOrder] = useState([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  const bottomRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingIndicatorTimeoutRef = useRef(null);
  const socketRef = useRef(null);
  const mediaInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const textareaRef = useRef(null);
  const shouldScrollRef = useRef(true);
  const navigate = useNavigate();
  const activeSelectedUserRef = useRef(null);
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Persist unreadMap ────────────────────────────────────────────────────────
  useEffect(() => {
    const key = `chatapp-unread||${user?.email}`;
    try {
      if (Object.keys(unreadMap).length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(unreadMap));
    } catch { /* ignore */ }
  }, [unreadMap, user?.email]);

  // ── Socket ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
      withCredentials: true,
      autoConnect: true,
    });
    socketRef.current = socket;

    const register = () => {
      if (userRef.current?.email) socket.emit("register", userRef.current.email);
      setConnectionStatus("online");
    };

    socket.on("connect", register);
    socket.on("disconnect", () => setConnectionStatus("offline"));
    socket.on("connect_error", () => setConnectionStatus("offline"));
    if (socket.connected) register();

    socket.on("users_update", (data) => {
      setUsers(Array.isArray(data) ? data : []);
    });

    socket.on("private_message", (incomingMessage) => {
      setMessages((prev) => {
        const isDuplicate = prev.some(
          (m) =>
            m.sender === incomingMessage.sender &&
            m.receiver === incomingMessage.receiver &&
            m.time === incomingMessage.time &&
            m.text === incomingMessage.text &&
            m.mediaUrl === incomingMessage.mediaUrl
        );
        return isDuplicate ? prev : [...prev, incomingMessage];
      });
      setIsTyping(false);

      const senderEmail = incomingMessage.sender;
      if (senderEmail && senderEmail !== userRef.current?.email) {
        const isViewingConversation = activeSelectedUserRef.current?.email === senderEmail;
        // Send read receipt if conversation is open
        if (isViewingConversation) {
          socket.emit("read_receipt", { to: senderEmail, from: userRef.current.email });
        } else {
          setUnreadMap((prev) => ({
            ...prev,
            [senderEmail]: {
              count: (prev[senderEmail]?.count || 0) + 1,
              lastText: incomingMessage.text || (incomingMessage.mediaUrl ? "📎 Media" : ""),
              lastTime: incomingMessage.time,
            },
          }));
          setFlashEmail(senderEmail);
          setTimeout(() => setFlashEmail((cur) => cur === senderEmail ? null : cur), 800);
        }
        setRecentOrder((prev) => [senderEmail, ...prev.filter((e) => e !== senderEmail)]);
      }
    });

    // Read receipt received — mark our messages as seen
    socket.on("read_receipt", ({ from }) => {
      setReadBy((prev) => new Set([...prev, from]));
    });

    // Reaction received
    socket.on("message_reaction", ({ msgKey, emoji }) => {
      setReactions((prev) => {
        const existing = prev[msgKey] || {};
        const emojiMap = { ...(existing[emoji] ? existing : {}), [emoji]: (existing[emoji] || 0) + 1 };
        return { ...prev, [msgKey]: { ...(prev[msgKey] || {}), ...emojiMap } };
      });
    });

    return () => {
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(typingIndicatorTimeoutRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ── Load users ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const loadUsers = async (attempt = 1) => {
      try {
        setIsLoadingUsers(true);
        setUsersError("");
        const response = await fetch(`${SERVER_URL}/api/users`);
        const data = await parseJsonResponse(response);
        if (cancelled) return;
        if (!response.ok) {
          if (response.status === 503 && attempt < 4) {
            setTimeout(() => { if (!cancelled) loadUsers(attempt + 1); }, 2000 * attempt);
            return;
          }
          throw new Error(data.error || "Unable to load users");
        }
        setUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        if (cancelled) return;
        setUsers([]);
        setUsersError(error.message || "Unable to load users");
      } finally {
        if (!cancelled) setIsLoadingUsers(false);
      }
    };
    loadUsers();
    return () => { cancelled = true; };
  }, []);

  // ── Load message history ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    const loadMessages = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/messages/${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data)) {
          setMessages(data);
          const seen = new Set();
          const order = [];
          for (let i = data.length - 1; i >= 0; i--) {
            const m = data[i];
            const other = m.sender === user.email ? m.receiver : m.sender;
            if (!seen.has(other)) { seen.add(other); order.unshift(other); }
          }
          setRecentOrder(order);
        }
      } catch (_err) {
        if (import.meta.env.DEV) console.error("Message history fetch error:", _err);
      }
    };
    loadMessages();
    return () => { cancelled = true; };
  }, [user?.email]);

  // ── Typing indicators ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleTypingStart = ({ from }) => {
      if (!selectedUser || from !== selectedUser.email) return;
      setIsTyping(true);
      clearTimeout(typingIndicatorTimeoutRef.current);
      typingIndicatorTimeoutRef.current = setTimeout(() => setIsTyping(false), 1500);
    };
    const handleTypingStop = ({ from }) => {
      if (!selectedUser || from !== selectedUser.email) return;
      setIsTyping(false);
    };
    socketRef.current?.on("typing", handleTypingStart);
    socketRef.current?.on("stop_typing", handleTypingStop);
    return () => {
      socketRef.current?.off("typing", handleTypingStart);
      socketRef.current?.off("stop_typing", handleTypingStop);
    };
  }, [selectedUser]);

  // ── Smart scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distFromBottom < 120;
    if (shouldScrollRef.current || nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    shouldScrollRef.current = false;
  }, [messages, selectedUser, isTyping]);

  // ── Close emoji picker on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!showEmojiPicker) return undefined;
    const handler = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmojiPicker]);

  // ── Close reaction picker on outside click ────────────────────────────────────
  useEffect(() => {
    if (!reactionPickerFor) return undefined;
    // Use a small timeout so the click that opened the picker doesn't
    // immediately close it, and so reaction button clicks fire before this handler.
    const handler = (e) => {
      // Don't close if clicking inside a reaction-related element
      if (e.target.closest?.(".chat-reaction-wrap")) return;
      setReactionPickerFor(null);
    };
    // Delay attaching so the opening click doesn't trigger it immediately
    const t = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", handler); };
  }, [reactionPickerFor]);

  // ── Send read receipt when conversation is opened ─────────────────────────────
  useEffect(() => {
    if (selectedUser?.email && socketRef.current) {
      socketRef.current.emit("read_receipt", { to: selectedUser.email, from: user?.email });
    }
  }, [selectedUser?.email, user?.email]);

  // ── Derived values ─────────────────────────────────────────────────────────────
  const activeSelectedUser = useMemo(
    () => selectedUser?.email
      ? users.find((u) => u.email === selectedUser.email) || selectedUser
      : null,
    [selectedUser, users]
  );

  useEffect(() => { activeSelectedUserRef.current = activeSelectedUser; }, [activeSelectedUser]);

  const filteredUsers = useMemo(() => {
    const base = users.filter((u) => {
      if (!u?.email || u.email === user?.email) return false;
      const q = search.toLowerCase();
      return u.email.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
    });
    return [...base].sort((a, b) => {
      const ai = recentOrder.indexOf(a.email);
      const bi = recentOrder.indexOf(b.email);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }, [search, user?.email, users, recentOrder]);

  const conversationMessages = useMemo(
    () => messages.filter((m) =>
      activeSelectedUser &&
      ((m.sender === user?.email && m.receiver === activeSelectedUser.email) ||
       (m.sender === activeSelectedUser.email && m.receiver === user?.email))
    ),
    [activeSelectedUser, messages, user?.email]
  );

  // Build message key for reactions/read receipts
  const msgKey = useCallback((m, idx) => `${m.sender}:${m.receiver}:${m.time}:${idx}`, []);

  // ── Handlers ────────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try { await signOut(auth); } catch { /* ignore */ }
    finally {
      try { localStorage.removeItem(`chatapp-unread||${user?.email}`); } catch { /* ignore */ }
      setSelectedUser(null);
      setMessage("");
      setMessages([]);
      setUnreadMap({});
      setRecentOrder([]);
      setUser(null);
      navigate("/login", { replace: true });
    }
  };

  const handleSelectUser = (entry) => {
    shouldScrollRef.current = true;
    setSelectedUser(entry);
    setUnreadMap((prev) => {
      if (!prev[entry.email]) return prev;
      const next = { ...prev };
      delete next[entry.email];
      return next;
    });
    setFlashEmail((cur) => cur === entry.email ? null : cur);
    setHighlightedMsgIndex(null);
  };

  const sendMessage = () => {
    if (!message.trim() || !activeSelectedUser || !user?.email) return;
    shouldScrollRef.current = true;
    const msgData = {
      text: message.trim(),
      sender: user.email,
      receiver: activeSelectedUser.email,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    if (replyingTo) {
      msgData.replyTo = {
        senderName: replyingTo.sender === user?.email ? "You" : activeSelectedUser.name || activeSelectedUser.email,
        text: replyingTo.text,
        mediaUrl: replyingTo.mediaUrl,
        mediaType: replyingTo.mediaType,
      };
    }
    socketRef.current?.emit("private_message", { to: activeSelectedUser.email, message: msgData });
    socketRef.current?.emit("stop_typing", { to: activeSelectedUser.email, from: user.email });
    setMessages((prev) => [...prev, msgData]);
    setMessage("");
    setIsTyping(false);
    setReplyingTo(null);
    setRecentOrder((prev) => [activeSelectedUser.email, ...prev.filter((e) => e !== activeSelectedUser.email)]);
  };

  const handleMessageKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleTyping = (event) => {
    setMessage(event.target.value);
    if (activeSelectedUser) {
      clearTimeout(typingTimeoutRef.current);
      socketRef.current?.emit("typing", { to: activeSelectedUser.email, from: user.email });
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit("stop_typing", { to: activeSelectedUser.email, from: user.email });
      }, 1200);
    }
  };

  const sendMediaMessage = async (file) => {
    const receiver = activeSelectedUserRef.current;
    const sender = userRef.current;
    if (!receiver?.email || !sender?.email) return;
    setMediaUploading(true);
    try {
      const formData = new FormData();
      formData.append("sender", sender.email);
      formData.append("receiver", receiver.email);
      formData.append("file", file);
      const res = await fetch(`${SERVER_URL}/api/media/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      const msgData = {
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        filename: data.filename,
        sender: sender.email,
        receiver: receiver.email,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      socketRef.current?.emit("private_message", { to: receiver.email, message: msgData });
      setMessages((prev) => [...prev, msgData]);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Media upload error:", err);
      alert(err?.message || "Media upload failed");
    } finally {
      setMediaUploading(false);
    }
  };

  const handleMediaFileChange = (e) => {
    const file = e.target.files[0];
    if (file) sendMediaMessage(file);
    e.target.value = "";
  };

  const handleEmojiSelect = (emoji) => {
    const ta = textareaRef.current;
    if (!ta) { setMessage((prev) => prev + emoji); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setMessage(message.slice(0, start) + emoji + message.slice(end));
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const handlePhotoUpdated = (newPhotoUrl) => {
    setUser((prev) => ({ ...prev, photo: newPhotoUrl }));
  };

  const handleReaction = (key, emoji) => {
    setReactions((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [emoji]: ((prev[key] || {})[emoji] || 0) + 1 },
    }));
    if (activeSelectedUser?.email) {
      socketRef.current?.emit("message_reaction", {
        to: activeSelectedUser.email,
        msgKey: key,
        emoji,
        by: user?.email,
      });
    }
  };

  const handleJumpToMessage = (targetMsg) => {
    const idx = conversationMessages.findIndex(
      (m) => m.sender === targetMsg.sender && m.time === targetMsg.time && m.text === targetMsg.text
    );
    if (idx === -1) return;
    setHighlightedMsgIndex(idx);
    setTimeout(() => {
      const el = messagesContainerRef.current?.querySelector(`[data-msgindex="${idx}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    setTimeout(() => setHighlightedMsgIndex(null), 2500);
  };

  // ── Group messages by date for separators ────────────────────────────────────
  // Build a list of items: { type: "date", label } | { type: "msg", entry, index }
  const messageItems = useMemo(() => {
    const items = [];
    let lastLabel = null;
    conversationMessages.forEach((entry, index) => {
      const label = getDateLabel(entry.time);
      if (label && label !== lastLabel) {
        items.push({ type: "date", label });
        lastLabel = label;
      }
      items.push({ type: "msg", entry, index });
    });
    return items;
  }, [conversationMessages]);

  // Check if the last message was sent by me and is read by the other user
  const lastOwnMsgIsRead = useMemo(() => {
    if (!activeSelectedUser) return false;
    return readBy.has(activeSelectedUser.email);
  }, [readBy, activeSelectedUser]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="chat-shell">
      <div className="chat-ambient chat-ambient-left" />
      <div className="chat-ambient chat-ambient-right" />

      {showProfileModal && (
        <ProfilePhotoModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          onPhotoUpdated={handlePhotoUpdated}
        />
      )}

      {showMsgSearch && activeSelectedUser && (
        <MessageSearchModal
          messages={conversationMessages}
          user={user}
          selectedUser={activeSelectedUser}
          onClose={() => setShowMsgSearch(false)}
          onJump={handleJumpToMessage}
        />
      )}

      <section className="chat-layout">
        {/* ── Sidebar ── */}
        <aside className="chat-sidebar">
          <div className="chat-sidebar-header">
            <div className="chat-sidebar-topline">
              <span className="chat-chip">Inbox</span>
              <div className="chat-sidebar-actions">
                {/* Connection dot */}
                <span
                  className={`chat-conn-dot chat-conn-dot-${connectionStatus}`}
                  title={connectionStatus === "online" ? "Connected" : connectionStatus === "offline" ? "Disconnected" : "Connecting…"}
                />
                <button type="button" className="chat-logout-button" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </div>

            <div className="chat-self-profile">
              <div
                className="chat-self-avatar-wrap chat-self-avatar-clickable"
                title="Update profile photo"
                onClick={() => setShowProfileModal(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setShowProfileModal(true)}
              >
                <Avatar name={user?.name} email={user?.email} photo={user?.photo} size={44} className="chat-self-avatar" />
                <span className="chat-online-ring" />
                <span className="chat-avatar-edit-hint" aria-hidden="true">📷</span>
              </div>
              <div className="chat-self-info">
                <strong>{user?.name || "You"}</strong>
                <span>{user?.email}</span>
              </div>
            </div>
          </div>

          <label className="chat-search">
            <span className="sr-only">Search user</span>
            <input
              type="text"
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <div className="chat-user-list">
            {isLoadingUsers ? (
              <div className="chat-empty-state">
                <strong>Loading users…</strong>
                <p>Please wait while we sync your contacts.</p>
              </div>
            ) : usersError ? (
              <div className="chat-empty-state">
                <strong>Unable to load users</strong>
                <p>{usersError}</p>
              </div>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((entry) => {
                const isActive = activeSelectedUser?.email === entry.email;
                const unread = unreadMap[entry.email];
                const hasUnread = !isActive && unread?.count > 0;
                const isFlashing = flashEmail === entry.email;

                const unreadCardStyle = hasUnread ? {
                  background: "linear-gradient(135deg, rgba(34,211,238,0.16), rgba(110,168,254,0.20), rgba(192,132,252,0.13))",
                  borderColor: "rgba(110, 168, 254, 0.65)",
                  boxShadow: "0 0 0 1.5px rgba(34,211,238,0.30), 0 6px 20px rgba(110,168,254,0.18)",
                } : {};

                const flashStyle = isFlashing ? {
                  background: "linear-gradient(135deg, rgba(34,211,238,0.32), rgba(110,168,254,0.36), rgba(192,132,252,0.26))",
                  borderColor: "rgba(34, 211, 238, 0.85)",
                  boxShadow: "0 0 0 2px rgba(34,211,238,0.55), 0 8px 28px rgba(110,168,254,0.30)",
                  transition: "none",
                } : {};

                const cardStyle = { ...unreadCardStyle, ...flashStyle };

                return (
                  <button
                    key={entry.email}
                    type="button"
                    className={[
                      "chat-user-card",
                      isActive ? "chat-user-card-active" : "",
                      hasUnread ? "chat-user-card-unread" : "",
                    ].filter(Boolean).join(" ")}
                    style={cardStyle}
                    onClick={() => handleSelectUser(entry)}
                  >
                    <div className="chat-avatar-wrap">
                      <Avatar name={entry.name} email={entry.email} photo={entry.photo} size={44} className="chat-avatar" />
                      {entry.isOnline && <span className="chat-online-ring" />}
                      {hasUnread && (
                        <span
                          className="chat-unread-dot"
                          aria-label={`${unread.count} unread`}
                          style={{
                            position: "absolute", top: "-4px", right: "-4px",
                            minWidth: "20px", height: "20px", borderRadius: "10px",
                            background: "linear-gradient(135deg,#22d3ee,#6ea8fe)",
                            color: "#04101e", fontSize: "11px", fontWeight: 900,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            padding: "0 5px", border: "2px solid #040d1a",
                            boxShadow: "0 0 10px rgba(34,211,238,0.8)", zIndex: 5,
                          }}
                        >
                          {unread.count > 99 ? "99+" : unread.count}
                        </span>
                      )}
                    </div>
                    <span className="chat-user-copy">
                      <strong style={hasUnread ? { color: "#ffffff", fontWeight: 700 } : {}}>
                        {entry.name || entry.email}
                      </strong>
                      {hasUnread
                        ? <span className="chat-unread-preview" style={{ color: "#c7e3ff", fontWeight: 500 }}>{unread.lastText}</span>
                        : <span className="chat-user-email">{entry.email}</span>
                      }
                      <span className={entry.isOnline ? "chat-status online" : "chat-status"}>
                        {hasUnread
                          ? <span className="chat-unread-time" style={{ color: "#22d3ee", fontWeight: 700 }}>{unread.lastTime}</span>
                          : entry.isOnline
                            ? <><span className="chat-online-dot" />Online</>
                            : `Last seen: ${formatLastSeen(entry.lastSeen)}`
                        }
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="chat-empty-state">
                <strong>No users found</strong>
                <p>Try a different name or email.</p>
              </div>
            )}
          </div>
        </aside>

        {/* ── Chat Panel ── */}
        <main className="chat-panel">
          <div className="chat-panel-header">
            <div>
              <span className="chat-chip">Direct Message</span>
              <h3>{activeSelectedUser ? activeSelectedUser.name || activeSelectedUser.email : "Select a user"}</h3>
              <p>
                {activeSelectedUser
                  ? activeSelectedUser.isOnline
                    ? <span className="panel-online-status"><span className="chat-online-dot panel-dot" />Online</span>
                    : <span className="panel-lastseen">Last seen: {formatLastSeen(activeSelectedUser.lastSeen)}</span>
                  : "Choose someone from the list to start chatting."
                }
              </p>
            </div>
            {/* Header actions */}
            {activeSelectedUser && (
              <div className="chat-panel-header-actions">
                <button
                  type="button"
                  className="chat-header-action-btn"
                  title="Search messages"
                  onClick={() => setShowMsgSearch(true)}
                >
                  🔍
                </button>
              </div>
            )}
          </div>

          <div className="chat-messages-wrap">
            <div
              className="chat-messages"
              ref={messagesContainerRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
                setShowScrollBtn(dist > 200);
              }}
            >
              {activeSelectedUser ? (
                conversationMessages.length > 0 ? (
                  <>
                    {messageItems.map((item, itemIdx) => {
                      if (item.type === "date") {
                        return (
                          <div key={`date-${item.label}-${itemIdx}`} className="chat-date-separator">
                            <span>{item.label}</span>
                          </div>
                        );
                      }

                      const { entry, index } = item;
                      const isOwn = entry.sender === user?.email;
                      const isReplying = replyingTo?.index === index;
                      const isHighlighted = highlightedMsgIndex === index;
                      const key = msgKey(entry, index);
                      const msgReactions = reactions[key] || {};
                      const hasReactions = Object.keys(msgReactions).length > 0;
                      const isLastOwn = isOwn && index === conversationMessages.length - 1;

                      return (
                        <article
                          key={`${entry.sender}-${entry.receiver}-${entry.time}-${index}`}
                          data-msgindex={index}
                          className={[
                            "chat-bubble",
                            isOwn ? "own" : "",
                            isReplying ? "replying" : "",
                            isHighlighted ? "chat-bubble-highlighted" : "",
                          ].filter(Boolean).join(" ")}
                          onMouseEnter={(e) => {
                            const replyBtn = e.currentTarget.querySelector(".chat-bubble-reply-btn");
                            if (replyBtn) replyBtn.style.opacity = "1";
                          }}
                          onMouseLeave={(e) => {
                            const replyBtn = e.currentTarget.querySelector(".chat-bubble-reply-btn");
                            if (replyBtn) replyBtn.style.opacity = "0";
                          }}
                        >
                          {/* Reply context */}
                          {entry.replyTo && (entry.replyTo.text || entry.replyTo.mediaUrl) && (
                            <div className="chat-reply-context">
                              {entry.replyTo.senderName && (
                                <span className="chat-reply-sender">{entry.replyTo.senderName}</span>
                              )}
                              <div className="chat-reply-preview">
                                {entry.replyTo.text ? (
                                  <p>{entry.replyTo.text.substring(0, 80)}{entry.replyTo.text.length > 80 ? "..." : ""}</p>
                                ) : entry.replyTo.mediaUrl ? (
                                  <span className="chat-reply-media">{entry.replyTo.mediaType === "video" ? "🎥 Video" : "📎 Image"}</span>
                                ) : null}
                              </div>
                            </div>
                          )}

                          <span className="chat-bubble-sender">
                            {isOwn ? "You" : activeSelectedUser.name || activeSelectedUser.email}
                          </span>

                          {entry.text && <p>{entry.text}</p>}
                          {entry.mediaUrl && <MediaMessage mediaUrl={entry.mediaUrl} mediaType={entry.mediaType} />}

                          {/* Reactions display */}
                          {hasReactions && (
                            <div className="chat-reactions">
                              {Object.entries(msgReactions).map(([emoji, count]) => (
                                <span key={emoji} className="chat-reaction-badge">{emoji} {count > 1 ? count : ""}</span>
                              ))}
                            </div>
                          )}

                          <div className="chat-bubble-footer">
                            <time>{formatMsgTime(entry.time)}</time>
                            {/* Read receipt for own messages */}
                            {isOwn && isLastOwn && (
                              <span className={`chat-read-receipt ${lastOwnMsgIsRead ? "read" : "sent"}`} title={lastOwnMsgIsRead ? "Seen" : "Sent"}>
                                {lastOwnMsgIsRead ? "✓✓" : "✓"}
                              </span>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="chat-bubble-actions">
                            {/* Reply button */}
                            <button
                              type="button"
                              className="chat-bubble-reply-btn"
                              onClick={() => setReplyingTo({ index, sender: entry.sender, text: entry.text, mediaUrl: entry.mediaUrl, mediaType: entry.mediaType })}
                              title="Reply"
                              aria-label="Reply to message"
                            >
                              ↩
                            </button>
                            {/* Reaction button */}
                            <div className="chat-reaction-wrap" style={{ position: "relative" }}>
                              <button
                                type="button"
                                className="chat-bubble-react-btn"
                                onClick={(e) => { e.stopPropagation(); setReactionPickerFor(reactionPickerFor === key ? null : key); }}
                                title="React"
                              >
                                😊
                              </button>
                              {reactionPickerFor === key && (
                                <ReactionPicker
                                  onSelect={(emoji) => handleReaction(key, emoji)}
                                  onClose={() => setReactionPickerFor(null)}
                                />
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    {isTyping && (
                      <div className="chat-typing-indicator"><span /><span /><span /></div>
                    )}
                  </>
                ) : (
                  <div className="chat-empty-state chat-empty-state-large">
                    <strong>No messages yet</strong>
                    <p>Send the first message to begin this conversation.</p>
                  </div>
                )
              ) : (
                <div className="chat-empty-state chat-empty-state-large">
                  <strong>Your conversation will appear here</strong>
                  <p>Select a user from the sidebar to open a private chat.</p>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {showScrollBtn && (
              <button
                type="button"
                className="chat-scroll-btn"
                aria-label="Scroll to latest message"
                onClick={() => {
                  shouldScrollRef.current = true;
                  bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
                  setShowScrollBtn(false);
                }}
              >
                ↓
              </button>
            )}
          </div>

          {/* Reply preview */}
          {replyingTo && (
            <div className="chat-reply-preview-section">
              <div className="chat-reply-preview-content">
                <span className="chat-reply-label">Replying to:</span>
                <div className="chat-reply-preview-message">
                  {replyingTo.text ? (
                    <p>{replyingTo.text.substring(0, 100)}{replyingTo.text.length > 100 ? "..." : ""}</p>
                  ) : replyingTo.mediaUrl ? (
                    <span className="chat-reply-media-label">{replyingTo.mediaType === "video" ? "🎥 Video" : "📎 Image"}</span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="chat-reply-cancel"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
              >
                ✕
              </button>
            </div>
          )}

          {/* Compose */}
          <div className="chat-compose">
            <div className="chat-compose-extras" ref={emojiPickerRef}>
              <button
                type="button"
                className="chat-emoji-toggle"
                onClick={() => setShowEmojiPicker((v) => !v)}
                disabled={!activeSelectedUser}
                title="Emoji"
                aria-label="Open emoji picker"
              >
                😊
              </button>
              {showEmojiPicker && <EmojiPicker onSelect={handleEmojiSelect} />}
            </div>

            <button
              type="button"
              className="chat-media-toggle"
              onClick={() => mediaInputRef.current?.click()}
              disabled={!activeSelectedUser || mediaUploading}
              title="Share photo or video"
              aria-label="Attach photo or video"
            >
              {mediaUploading ? "⏳" : "📎"}
            </button>
            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/*"
              style={{ display: "none" }}
              onChange={handleMediaFileChange}
            />

            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleTyping}
              onKeyDown={handleMessageKeyDown}
              placeholder={
                activeSelectedUser
                  ? `Message ${activeSelectedUser.name || activeSelectedUser.email}`
                  : "Pick a user to start typing"
              }
              disabled={!activeSelectedUser}
              rows="1"
            />
            <button
              type="button"
              className="chat-send-button"
              onClick={sendMessage}
              disabled={!activeSelectedUser || !message.trim()}
            >
              Send
            </button>
          </div>
        </main>
      </section>
    </div>
  );
}

export default Chat;