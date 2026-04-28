import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { parseJsonResponse } from "../utils/http";
import "../App.css";
import "../App.enhanced.css";
import "../chat.profile.css";
import "../chat.media.css";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");

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
  const bg      = hashColor(name || email);

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

function EmojiPicker({ onSelect }) {
  return (
    <div className="emoji-picker-popover" role="dialog" aria-label="Emoji picker">
      <div className="emoji-picker-grid">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-btn"
            onClick={() => onSelect(emoji)}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Profile Photo Modal ──────────────────────────────────────────────────────
function ProfilePhotoModal({ user, onClose, onPhotoUpdated }) {
  const [preview, setPreview]     = useState(null);
  const [file, setFile]           = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState("");
  const inputRef                  = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError("Only image files are allowed."); return; }
    if (f.size > 5 * 1024 * 1024)    { setError("Image must be under 5 MB."); return; }
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

      const res  = await fetch(`${SERVER_URL}/api/profile/photo`, { method: "POST", body: formData });
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
              : <Avatar name={user?.name} email={user?.email} photo={user?.photo} size={100} />
            }
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

// ─── Chat ─────────────────────────────────────────────────────────────────────
function Chat({ user, setUser }) {
  const [message, setMessage]             = useState("");
  const [messages, setMessages]           = useState([]);
  const [users, setUsers]                 = useState([]);
  const [search, setSearch]               = useState("");
  const [selectedUser, setSelectedUser]   = useState(null);
  const [isTyping, setIsTyping]           = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError]       = useState("");
  const [showEmojiPicker, setShowEmojiPicker]   = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mediaUploading, setMediaUploading]     = useState(false);
  // unreadMap: { [senderEmail]: { count, lastText, lastTime } }
  const [unreadMap, setUnreadMap]         = useState({});
  // recentOrder: email[] sorted by last-message timestamp
  const [recentOrder, setRecentOrder]     = useState([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // replyingTo: { index, sender, text, mediaUrl, mediaType } - for message reply feature
  const [replyingTo, setReplyingTo]       = useState(null);

  const bottomRef                 = useRef(null);
  const messagesContainerRef      = useRef(null);
  const typingTimeoutRef          = useRef(null);
  const typingIndicatorTimeoutRef = useRef(null);
  const socketRef                 = useRef(null);
  const mediaInputRef             = useRef(null);
  const emojiPickerRef            = useRef(null);
  const textareaRef               = useRef(null);
  const shouldScrollRef           = useRef(true); // true = scroll to bottom on next render
  const navigate                  = useNavigate();

  // Keep latest values in refs so callbacks never go stale — eliminates
  // all exhaustive-deps warnings without disabling the rule.
  const activeSelectedUserRef = useRef(null);
  const userRef               = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Socket ────────────────────────────────────────────────────────────────
  // All listeners attached here immediately after socket creation —
  // prevents race conditions from separate useEffect hooks.
  useEffect(() => {
    if (socketRef.current) return;
    const socket = io(SERVER_URL, { transports: ["websocket"], withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (userRef.current?.email) socket.emit("register", userRef.current.email);
    });

    socket.on("users_update", (data) => {
      setUsers(Array.isArray(data) ? data : []);
    });

    socket.on("private_message", (incomingMessage) => {
      setMessages((prev) => {
        const isDuplicate = prev.some(
          (m) =>
            m.sender   === incomingMessage.sender &&
            m.receiver === incomingMessage.receiver &&
            m.time     === incomingMessage.time &&
            m.text     === incomingMessage.text &&
            m.mediaUrl === incomingMessage.mediaUrl
        );
        return isDuplicate ? prev : [...prev, incomingMessage];
      });
      setIsTyping(false);

      const senderEmail = incomingMessage.sender;
      if (senderEmail && senderEmail !== userRef.current?.email) {
        const isViewingConversation =
          activeSelectedUserRef.current?.email === senderEmail;
        if (!isViewingConversation) {
          setUnreadMap((prev) => ({
            ...prev,
            [senderEmail]: {
              count:    (prev[senderEmail]?.count || 0) + 1,
              lastText: incomingMessage.text || (incomingMessage.mediaUrl ? "📎 Media" : ""),
              lastTime: incomingMessage.time,
            },
          }));
        }
        setRecentOrder((prev) => [
          senderEmail,
          ...prev.filter((e) => e !== senderEmail),
        ]);
      }
    });

    return () => {
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(typingIndicatorTimeoutRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // intentionally empty — socket + all listeners created once on mount

  useEffect(() => {
    if (user?.email && socketRef.current?.connected) {
      socketRef.current.emit("register", user.email);
    }
  }, [user?.email]);

  // ── Load users ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const loadUsers = async (attempt = 1) => {
      try {
        setIsLoadingUsers(true);
        setUsersError("");
        const response = await fetch(`${SERVER_URL}/api/users`);
        const data     = await parseJsonResponse(response);
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
        if (import.meta.env.DEV) console.error("Users fetch error:", error);
        setUsers([]);
        setUsersError(error.message || "Unable to load users");
      } finally {
        if (!cancelled) setIsLoadingUsers(false);
      }
    };
    loadUsers();
    return () => { cancelled = true; };
  }, []);

  // ── Load message history ─────────────────────────────────────────
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    const loadMessages = async () => {
      try {
        const res  = await fetch(`${SERVER_URL}/api/messages/${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data)) {
          setMessages(data);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error("Message history fetch error:", err);
      }
    };
    loadMessages();
    return () => { cancelled = true; };
  }, [user?.email]);


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
    socketRef.current?.on("typing",      handleTypingStart);
    socketRef.current?.on("stop_typing", handleTypingStop);
    return () => {
      socketRef.current?.off("typing",      handleTypingStart);
      socketRef.current?.off("stop_typing", handleTypingStop);
    };
  }, [selectedUser]);

  // Smart scroll: only jump to bottom if the user is already near it,
  // or if shouldScrollRef says so (set true right before sending).
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom     = distFromBottom < 120;
    if (shouldScrollRef.current || nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    shouldScrollRef.current = false;
  }, [messages, selectedUser, isTyping]);

  // ── Close emoji picker on outside click ───────────────────────────────────
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

  // ── Derived values ────────────────────────────────────────────────────────
  const activeSelectedUser = useMemo(
    () => selectedUser?.email
      ? users.find((u) => u.email === selectedUser.email) || selectedUser
      : null,
    [selectedUser, users]
  );

  // Keep ref in sync so media/upload callbacks can read it without stale closure
  useEffect(() => { activeSelectedUserRef.current = activeSelectedUser; }, [activeSelectedUser]);

  const filteredUsers = useMemo(() => {
    const base = users.filter((u) => {
      if (!u?.email || u.email === user?.email) return false;
      const q = search.toLowerCase();
      return u.email.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
    });
    // Sort by recentOrder (most recently messaged first), then alphabetical
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try { await signOut(auth); } catch (err) {
      if (import.meta.env.DEV) console.error("Logout error:", err);
    } finally {
      setSelectedUser(null);
      setMessage("");
      setMessages([]);
      setUnreadMap({});
      setRecentOrder([]);
      setUser(null);
      navigate("/login", { replace: true });
    }
  };

  // Clear unread badge when a conversation is opened
  const handleSelectUser = (entry) => {
    shouldScrollRef.current = true; // jump to bottom when opening a chat
    setSelectedUser(entry);
    if (unreadMap[entry.email]) {
      setUnreadMap((prev) => {
        const next = { ...prev };
        delete next[entry.email];
        return next;
      });
    }
  };

  const sendMessage = () => {
    if (!message.trim() || !activeSelectedUser || !user?.email) return;
    shouldScrollRef.current = true; // always scroll to bottom on own send
    const msgData = {
      text:     message.trim(),
      sender:   user.email,
      receiver: activeSelectedUser.email,
      time:     new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    
    // Add reply information if replying to a message
    if (replyingTo) {
      msgData.replyTo = {
        senderName: replyingTo.sender === user?.email ? "You" : activeSelectedUser.name || activeSelectedUser.email,
        text: replyingTo.text,
        mediaUrl: replyingTo.mediaUrl,
        mediaType: replyingTo.mediaType,
      };
    }
    
    socketRef.current?.emit("private_message", { to: activeSelectedUser.email, message: msgData });
    socketRef.current?.emit("stop_typing",     { to: activeSelectedUser.email, from: user.email });
    setMessages((prev) => [...prev, msgData]);
    setMessage("");
    setIsTyping(false);
    setReplyingTo(null);
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

  // Uses refs — no stale closure, no useCallback needed
  const sendMediaMessage = async (file) => {
    const receiver = activeSelectedUserRef.current;
    const sender   = userRef.current;
    if (!receiver?.email || !sender?.email) return;

    setMediaUploading(true);
    try {
      const formData = new FormData();
      formData.append("sender",   sender.email);
      formData.append("receiver", receiver.email);
      formData.append("file",     file);

      const res  = await fetch(`${SERVER_URL}/api/media/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");

      const msgData = {
        mediaUrl:  data.mediaUrl,
        mediaType: data.mediaType,
        filename:  data.filename,
        sender:    sender.email,
        receiver:  receiver.email,
        time:      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
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
    const end   = ta.selectionEnd;
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

  // ── Render ────────────────────────────────────────────────────────────────
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

      <section className="chat-layout">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-header">
            <div className="chat-sidebar-topline">
              <span className="chat-chip">Inbox</span>
              <button type="button" className="chat-logout-button" onClick={handleLogout}>
                Logout
              </button>
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
                const isActive  = activeSelectedUser?.email === entry.email;
                const unread    = unreadMap[entry.email];
                const hasUnread = !isActive && unread?.count > 0;
                return (
                  <button
                    key={entry.email}
                    type="button"
                    className={`chat-user-card${isActive ? " chat-user-card-active" : ""}${hasUnread ? " chat-user-card-unread" : ""}`}
                    onClick={() => handleSelectUser(entry)}
                  >
                    <div className="chat-avatar-wrap">
                      <Avatar name={entry.name} email={entry.email} photo={entry.photo} size={44} className="chat-avatar" />
                      {entry.isOnline && <span className="chat-online-ring" />}
                      {hasUnread && <span className="chat-unread-dot" aria-label={`${unread.count} unread messages`} />}
                    </div>
                    <span className="chat-user-copy">
                      <strong>{entry.name || entry.email}</strong>
                      {hasUnread
                        ? <span className="chat-unread-preview">{unread.lastText}</span>
                        : <span>{entry.email}</span>
                      }
                      <span className={entry.isOnline ? "chat-status online" : "chat-status"}>
                        {hasUnread
                          ? <span className="chat-unread-time">{unread.lastTime}</span>
                          : entry.isOnline ? "Online" : `Last seen: ${entry.lastSeen || "Offline"}`
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

        <main className="chat-panel">
          <div className="chat-panel-header">
            <div>
              <span className="chat-chip">Direct Message</span>
              <h3>{activeSelectedUser ? activeSelectedUser.name || activeSelectedUser.email : "Select a user"}</h3>
              <p>
                {activeSelectedUser
                  ? activeSelectedUser.isOnline ? "Available now" : activeSelectedUser.lastSeen || "Offline"
                  : "Choose someone from the list to start chatting."}
              </p>
            </div>
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
                    {conversationMessages.map((entry, index) => {
                      const isOwn = entry.sender === user?.email;
                      const isReplying = replyingTo?.index === index;
                      return (
                        <article
                          key={`${entry.sender}-${entry.receiver}-${entry.time}-${index}`}
                          className={`chat-bubble${isOwn ? " own" : ""}${isReplying ? " replying" : ""}`}
                          onMouseEnter={(e) => {
                            const replyBtn = e.currentTarget.querySelector(".chat-bubble-reply-btn");
                            if (replyBtn) replyBtn.style.opacity = "1";
                          }}
                          onMouseLeave={(e) => {
                            const replyBtn = e.currentTarget.querySelector(".chat-bubble-reply-btn");
                            if (replyBtn) replyBtn.style.opacity = "0";
                          }}
                        >
                          {/* Replied-to message context — only render when there is actual content */}
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
                          
                          <time>{entry.time}</time>
                          
                          {/* Reply button */}
                          <button
                            type="button"
                            className="chat-bubble-reply-btn"
                            onClick={() => setReplyingTo({ index, sender: entry.sender, text: entry.text, mediaUrl: entry.mediaUrl, mediaType: entry.mediaType })}
                            title="Reply to this message"
                            aria-label="Reply to message"
                          >
                            ↩️
                          </button>
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

          {/* Reply preview section */}
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