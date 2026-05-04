import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { signOut } from "firebase/auth";
import { AnimatePresence } from "framer-motion";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { parseJsonResponse, requestJson } from "../utils/http";
import { useToast } from "./ToastContext";
import BottomNav from "./BottomNav";
import { useNotifications } from "../utils/useNotifications";
import StatusViewer from "./Status/StatusViewer";
import "../App.css";
import "../App.enhanced.css";
import "../chatv2.css";
import "../chat.profile.css";
import "../chat.media.css";
import "../chat.bubble-fix.css";
import "../chat.reactions.fix.css";
import "../chat.unread.css";
import "../chat-overrides.css";
import "../chat.status.css";
import "../status.v3.css";

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
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatMsgTime(timeStr) {
  if (!timeStr) return "";
  if (/^\d{1,2}:\d{2}/.test(timeStr)) return timeStr;
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return timeStr;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

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

const AVATAR_COLORS = [
  "#4f46e5", "#0891b2", "#059669", "#d97706",
  "#dc2626", "#7c3aed", "#db2777", "#0284c7",
];

function hashColor(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function resolveAssetUrl(url) {
  if (!url || typeof url !== "string") return null;
  return url.startsWith("http") ? url : `${SERVER_URL}${url}`;
}

function Avatar({ name, email, photo, size = 44, className = "" }) {
  const initial = (name || email || "?")[0].toUpperCase();
  const bg = hashColor(name || email);
  const resolvedPhoto = resolveAssetUrl(photo);
  if (resolvedPhoto) {
    return (
      <img
        src={resolvedPhoto}
        alt={name || email}
        className={className}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0 }}
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
function ReactionPicker({ onSelect, onClose, isOwn }) {
  return (
    <div className={`reaction-picker-popover ${isOwn ? "reaction-picker-own" : "reaction-picker-other"}`}>
      {REACTION_EMOJIS.map((e) => (
        <button key={e} type="button" className="reaction-picker-btn" onClick={() => { onSelect(e); onClose(); }}>
          {e}
        </button>
      ))}
    </div>
  );
}

// ─── Profile Photo Modal — only usable in settings (canEdit flag) ─────────────
function ProfilePhotoModal({ user, onClose, onPhotoUpdated, targetUser, canEdit = true }) {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const displayUser = targetUser || user;

  const handleFileChange = (e) => {
    if (!canEdit) return;
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
    if (!file || !canEdit) return;
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
      <div className="profile-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <h3>{canEdit ? "Update Profile Photo" : `${displayUser?.name || "User"}'s Photo`}</h3>
          <button type="button" className="profile-modal-close-btn" onClick={onClose} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="profile-modal-content">
          <div className="profile-image-preview-section">
            <div className="profile-preview-circle">
              {preview
                ? <img src={preview} alt="New profile preview" className="profile-preview-img" />
                : <Avatar name={displayUser?.name} email={displayUser?.email} photo={displayUser?.photo} size={250} />}
              {canEdit && (
                <button
                  type="button"
                  className="profile-edit-overlay-btn"
                  onClick={() => inputRef.current?.click()}
                  title="Change Photo"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span>CHANGE</span>
                </button>
              )}
            </div>
            {canEdit && <p className="profile-modal-hint">JPG, PNG or GIF. Max 5MB. Photo can only be changed here in Settings.</p>}
            {!canEdit && (
              <p className="profile-modal-hint" style={{ textAlign: "center" }}>
                Profile photo of <strong>{displayUser?.name || displayUser?.email}</strong>
              </p>
            )}
          </div>

          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />

          {error && (
            <div className="profile-modal-error-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="profile-modal-actions">
            <button type="button" className="profile-action-btn cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="profile-action-btn save"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? (
                <span className="btn-loading-state">
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/></svg>
                  Saving...
                </span>
              ) : "Save Photo"}
            </button>
          </div>
        )}
        {!canEdit && (
          <div className="profile-modal-actions">
            <button type="button" className="profile-action-btn cancel" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Voice Player (Custom) ───────────────────────────────────────────────────
function VoicePlayer({ url }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const onTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const onEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="voice-player-container">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
      />
      <button type="button" className="voice-play-btn" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
      <div className="voice-progress-wrap">
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={currentTime}
          onChange={handleSeek}
          className="voice-seekbar"
        />
        <div className="voice-time-row">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="voice-avatar-mini">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
      </div>
    </div>
  );
}

// ─── Media Message ────────────────────────────────────────────────────────────
function MediaMessage({ mediaUrl, mediaType }) {
  const absoluteUrl = resolveAssetUrl(mediaUrl);
  if (mediaType === "video") {
    return <video src={absoluteUrl} controls className="chat-media-video" preload="metadata" />;
  }
  if (mediaType === "audio") {
    return <VoicePlayer url={absoluteUrl} />;
  }
  return (
    <a href={absoluteUrl} target="_blank" rel="noopener noreferrer">
      <img src={absoluteUrl} alt="shared" className="chat-media-image" />
    </a>
  );
}

function normalizeMessage(message) {
  const reactions = message?.reactions && typeof message.reactions === "object" ? message.reactions : {};
  return {
    ...message,
    reactions,
    deliveryState: message?.deliveryState || "sent",
  };
}

function getMessageId(message, fallbackIndex = null) {
  return message?._id || message?.clientTempId || `${message?.sender}:${message?.receiver}:${message?.time}:${fallbackIndex ?? "x"}`;
}

// ─── Hello Hub-style Reply Preview Banner ─────────────────────────────────────
function ReplyBanner({ replyingTo, onCancel }) {
  if (!replyingTo) return null;
  return (
    <div className="chat-reply-banner">
      <div className="chat-reply-banner-bar" />
      <div className="chat-reply-banner-content">
        <span className="chat-reply-banner-name">{replyingTo.senderName || "User"}</span>
        <p className="chat-reply-banner-text">
          {replyingTo.mediaUrl ? "📎 Media" : (replyingTo.text || "")}
        </p>
      </div>
      <button type="button" className="chat-reply-banner-close" onClick={onCancel} aria-label="Cancel reply">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Search Messages</span>
          <button className="profile-modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
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

// ─── Status Page ─────────────────────────────────────────────────────────────
function StatusPage({
  user, users, statusText, setStatusText,
  statusFile, setStatusFile, isEditingStatus, setIsEditingStatus,
  statusUploading, handleStatusUpdate, viewingStatusUser, setViewingStatusUser,
  SERVER_URL, onStatusLike, onStatusView,
}) {
  const statusInputRef = useRef(null);
  const [postMode, setPostMode] = useState(null); // 'text' | 'media' | null

  useEffect(() => {
    if (viewingStatusUser && viewingStatusUser.email !== user?.email) {
      onStatusView(viewingStatusUser.email);
    }
  }, [viewingStatusUser?.email]);

  const openMediaPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) { setStatusFile(file); setIsEditingStatus(true); setPostMode("media"); }
    };
    input.click();
  };

  const contactsWithStatus = users.filter(u => u.email !== user?.email && u.statuses?.length > 0);

  return (
    <main className="status-page">

      {/* ── Fixed header ── */}
      <div className="status-page-header">
        <h3>Status</h3>
        <span>Updates from your network</span>
      </div>

      <div className="status-page-body">

        {/* ── My Status Card ── */}
        <div className="status-my-card">
          <div className="status-my-avatar-col">
            <div className="status-my-avatar-wrap">
              <Avatar name={user?.name} email={user?.email} photo={user?.photo} size={54} />
              {user?.statuses?.length > 0 && (
                <span className={`status-ring ${user.statuses?.every(s => s.views?.includes(user.email)) ? "seen" : ""}`} />
              )}
            </div>
          </div>
          <div className="status-my-info">
            <strong>My Status</strong>
            <p>{user?.statuses?.length > 0 ? "Tap to view your status" : "Share a photo, video, or text update"}</p>
          </div>
          <div className="status-my-actions">
            <button
              type="button"
              className="status-action-btn media-btn"
              onClick={openMediaPicker}
              title="Add photo or video"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
            <button
              type="button"
              className="status-action-btn text-btn"
              onClick={() => setPostMode(postMode === "text" ? null : "text")}
              title="Add text status"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Text Status Composer ── */}
        {postMode === "text" && (
          <div className="status-text-composer">
            <textarea
              ref={statusInputRef}
              placeholder="What's on your mind? (max 280 chars)"
              maxLength={280}
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              autoFocus
              rows={3}
            />
            <div className="status-composer-footer">
              <span className="status-char-count">{statusText.length}/280</span>
              <div className="status-composer-actions">
                <button
                  type="button"
                  className="status-cancel-btn"
                  onClick={() => { setPostMode(null); setStatusText(""); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="status-post-btn"
                  onClick={() => { handleStatusUpdate(); setPostMode(null); }}
                  disabled={!statusText.trim() || statusUploading}
                >
                  {statusUploading ? "Posting…" : "Post Status"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Contact Status List ── */}
        <div className="status-contacts-section">
          <div className="status-section-label">Recent updates</div>

          {contactsWithStatus.length === 0 ? (
            <div className="status-empty-state">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.18 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <p>No recent updates from your contacts</p>
              <span>Status updates disappear after 24 hours</span>
            </div>
          ) : (
            <div className="status-contact-list">
              {contactsWithStatus.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  className={`status-contact-card ${viewingStatusUser?.email === u.email ? "viewing" : ""}`}
                  onClick={() => setViewingStatusUser(viewingStatusUser?.email === u.email ? null : u)}
                >
                  <div className="status-avatar-ring-wrap">
                    <Avatar name={u.name} email={u.email} photo={u.photo} size={50} />
                    <span className={`status-ring ${u.statuses?.every(s => s.views?.includes(user?.email)) ? "seen" : ""}`} />
                  </div>
                  <div className="status-contact-info">
                    <strong>{u.name || u.email}</strong>
                  <span>{u.statuses?.length > 0 ? new Date(u.statuses[u.statuses.length - 1].createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  </div>
                  {u.statuses?.length > 0 && u.statuses[u.statuses.length - 1].text && (
                    <p className="status-contact-preview">{u.statuses[u.statuses.length - 1].text.slice(0, 50)}{u.statuses[u.statuses.length - 1].text.length > 50 ? "…" : ""}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Calls Panel ─────────────────────────────────────────────────────────────


function CallsPanel({ contacts, callHistory, onStartCall }) {
  return (
    <main className="chat-panel full-height">
      <div className="chat-panel-header">
        <div className="chat-panel-header-left">
          <div className="chat-active-user-info">
            <h3>Calls</h3>
            <p>Voice and video call shortcuts with recent activity.</p>
          </div>
        </div>
      </div>

      <div className="chat-feature-panel">
        <section className="chat-feature-hero">
          <div>
            <span className="chat-feature-kicker">Fast calling</span>
            <h2>Start a voice or video conversation in one tap.</h2>
            <p>Calls are prepared with microphone and camera permissions for a smooth Hello Hub-style launch flow.</p>
          </div>
        </section>

        <section className="chat-feature-grid">
          <div className="chat-card-section">
            <div className="chat-section-head">
              <h4>Quick Call</h4>
              <span>{contacts.length} contacts</span>
            </div>
            <div className="chat-call-list">
              {contacts.length > 0 ? contacts.map((entry) => (
                <article key={entry.email} className="chat-call-card">
                  <div className="chat-call-card-main">
                    <Avatar name={entry.name} email={entry.email} photo={entry.photo} size={52} className="chat-avatar" />
                    <div className="chat-call-copy">
                      <strong>{entry.name || entry.email}</strong>
                      <span>{entry.isOnline ? "Online now" : `Last seen ${formatLastSeen(entry.lastSeen)}`}</span>
                    </div>
                  </div>
                  <div className="chat-call-actions">
                    <button type="button" className="chat-call-action-btn voice" onClick={() => onStartCall("voice", entry)} title="Voice call">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.46-1.24a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92z"/></svg>
                    </button>
                    <button type="button" className="chat-call-action-btn video" onClick={() => onStartCall("video", entry)} title="Video call">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    </button>
                  </div>
                </article>
              )) : <div className="chat-empty-state">Your recent chat contacts will show up here for quick calling.</div>}
            </div>
          </div>

          <div className="chat-card-section">
            <div className="chat-section-head">
              <h4>Recent Calls</h4>
              <span>{callHistory.length} records</span>
            </div>
            <div className="chat-call-history">
              {callHistory.length > 0 ? callHistory.map((item) => (
                <article key={item.id} className="chat-history-card">
                  <div className={`chat-history-icon ${item.type}`}>
                    {item.type === "video"
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.46-1.24a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92z"/></svg>
                    }
                  </div>
                  <div className="chat-history-copy">
                    <strong>{item.name}</strong>
                    <span>{item.type === "video" ? "Video call" : "Voice call"} · {item.status} · {item.durationLabel}</span>
                  </div>
                  <time>{item.timeLabel}</time>
                </article>
              )) : <div className="chat-empty-state">No calls yet. Start one from a chat or the quick call list.</div>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// ─── Settings panel — photo edit only here ────────────────────────────────────
function SettingsPanel({ user, draft, onDraftChange, onSave, onOpenProfile, onLogout, saving, theme, toggleTheme, stats, onBack }) {
  return (
    <main className="settings-fullpage">
      <div className="settings-header">
        <button type="button" className="settings-back-btn" onClick={onBack} aria-label="Back to chats">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="settings-header-info">
          <h3>Settings</h3>
          <p>Profile, privacy, notifications &amp; preferences</p>
        </div>
        <button type="button" className="settings-save-quick-btn" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="chat-feature-panel settings-panel-view">
        <section className="chat-settings-top">
          <div className="chat-settings-profile-card">
            {/* Photo change — only accessible from this Settings page */}
            <button type="button" className="chat-settings-avatar-btn" onClick={onOpenProfile} title="Change profile photo">
              <div className="chat-settings-avatar-wrap">
                <Avatar name={user?.name} email={user?.email} photo={user?.photo} size={76} className="chat-settings-avatar" />
                <span className="chat-settings-avatar-edit-badge" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </span>
              </div>
              <span className="chat-settings-avatar-label">Change photo</span>
            </button>
            <div className="chat-settings-profile-copy">
              <h4>{user?.name || user?.email}</h4>
              <p>{draft.bio || "Add a short bio for your profile."}</p>
              <span>{user?.email}</span>
            </div>
          </div>
          <div className="chat-settings-stats">
            <div className="chat-stat-tile"><strong>{stats.unreadCount}</strong><span>Unread</span></div>
            <div className="chat-stat-tile"><strong>{stats.statusCount}</strong><span>Status</span></div>
            <div className="chat-stat-tile"><strong>{stats.blockedCount}</strong><span>Blocked</span></div>
            <div className="chat-stat-tile"><strong>{stats.pinnedCount}</strong><span>Pinned</span></div>
          </div>
        </section>

        <section className="chat-feature-grid settings-grid">
          <div className="chat-card-section">
            <div className="chat-section-head">
              <h4>Profile</h4>
              <span>Visible account details</span>
            </div>
            <div className="chat-settings-form">
              <label className="chat-settings-field">
                <span>Name</span>
                <input type="text" value={draft.name} onChange={(e) => onDraftChange("name", e.target.value)} />
              </label>
              <label className="chat-settings-field">
                <span>Phone</span>
                <input type="text" value={draft.phone} onChange={(e) => onDraftChange("phone", e.target.value)} placeholder="+91 98765 43210" />
              </label>
              <label className="chat-settings-field">
                <span>Bio</span>
                <textarea rows="4" value={draft.bio} onChange={(e) => onDraftChange("bio", e.target.value)} maxLength={160} />
              </label>
            </div>
          </div>

          <div className="chat-card-section">
            <div className="chat-section-head">
              <h4>Privacy</h4>
              <span>Control what others can see</span>
            </div>
            <div className="chat-settings-form">
              <label className="chat-settings-field">
                <span>Last seen</span>
                <select value={draft.privacy.lastSeen} onChange={(e) => onDraftChange("privacy.lastSeen", e.target.value)}>
                  <option value="everyone">Everyone</option>
                  <option value="contacts">My contacts</option>
                  <option value="nobody">Nobody</option>
                </select>
              </label>
              <label className="chat-settings-field">
                <span>Profile photo</span>
                <select value={draft.privacy.profilePhoto} onChange={(e) => onDraftChange("privacy.profilePhoto", e.target.value)}>
                  <option value="everyone">Everyone</option>
                  <option value="contacts">My contacts</option>
                  <option value="nobody">Nobody</option>
                </select>
              </label>
              <label className="chat-toggle-row">
                <div>
                  <strong>Read receipts</strong>
                  <span>Allow others to know when you have read messages.</span>
                </div>
                <input type="checkbox" checked={draft.privacy.readReceipts} onChange={(e) => onDraftChange("privacy.readReceipts", e.target.checked)} />
              </label>

              <div className="chat-settings-field">
                <span>Restrict users (Emails)</span>
                <div className="chat-restriction-input-row">
                  <input
                    type="email"
                    placeholder="Enter email to restrict"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.target.value.trim()) {
                        const email = e.target.value.trim();
                        if (!draft.privacy.restrictedEmails?.includes(email)) {
                          onDraftChange("privacy.restrictedEmails", [...(draft.privacy.restrictedEmails || []), email]);
                        }
                        e.target.value = "";
                      }
                    }}
                  />
                </div>
                <div className="chat-restricted-list">
                  {(draft.privacy.restrictedEmails || []).map((email) => (
                    <span key={email} className="chat-restricted-tag">
                      {email}
                      <button
                        type="button"
                        onClick={() => onDraftChange("privacy.restrictedEmails", (draft.privacy.restrictedEmails || []).filter(e => e !== email))}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {!(draft.privacy.restrictedEmails?.length) && <p className="chat-field-hint">No users restricted.</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="chat-card-section">
            <div className="chat-section-head">
              <h4>Notifications</h4>
              <span>Device and desktop behavior</span>
            </div>
            <div className="chat-settings-form">
              {[
                ["notifications.messagePreview", "Message preview", "Show a preview in notifications."],
                ["notifications.sound", "Sound", "Play a sound for new activity."],
                ["notifications.vibrate", "Vibrate", "Use vibration feedback on supported devices."],
                ["notifications.desktopAlerts", "Desktop alerts", "Keep tab notifications visible on desktop."],
              ].map(([key, title, desc]) => (
                <label key={key} className="chat-toggle-row">
                  <div>
                    <strong>{title}</strong>
                    <span>{desc}</span>
                  </div>
                  <input type="checkbox" checked={key.split(".").reduce((acc, part) => acc?.[part], draft)} onChange={(e) => onDraftChange(key, e.target.checked)} />
                </label>
              ))}
            </div>
          </div>

          <div className="chat-card-section">
            <div className="chat-section-head">
              <h4>Experience</h4>
              <span>App-wide preferences</span>
            </div>
            <div className="chat-settings-form">
              <label className="chat-toggle-row">
                <div>
                  <strong>{theme === "dark" ? "Dark mode" : "Light mode"}</strong>
                  <span>Switch the full messaging interface theme.</span>
                </div>
                <button type="button" className="chat-theme-toggle-btn" onClick={toggleTheme}>
                  {theme === "dark"
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3c0 .28 0 .57.02.85A7 7 0 0 0 20.15 12c.28 0 .57 0 .85-.02z"/></svg>
                  }
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
              </label>
              <div className="chat-insight-card">
                <strong>End-to-end encryption</strong>
                <span>Conversation transport and data model are prepared as a secure baseline. Full cross-device key exchange can be layered on top.</span>
              </div>
            </div>
            <div className="chat-settings-actions">
              <button type="button" className="chat-primary-btn" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save settings"}</button>
              <button type="button" className="chat-secondary-btn danger" onClick={onLogout}>Logout</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function IncomingCallModal({ call, onAccept, onDecline }) {
  if (!call) return null;
  return (
    <div className="chat-call-overlay incoming">
      <div className="chat-call-modal">
        <div className="chat-call-avatar-wrap pulse-ring">
          <Avatar name={call.target.name} email={call.target.email} photo={call.target.photo} size={92} className="chat-call-avatar" />
        </div>
        <h3>{call.target.name || call.target.email}</h3>
        <p>Incoming {call.type === "video" ? "Video" : "Voice"} Call...</p>
        <div className="chat-call-controls">
          <button type="button" className="chat-mini-action-btn success" onClick={onAccept}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.46-1.24a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92z"/></svg>
            Accept
          </button>
          <button type="button" className="chat-mini-action-btn danger" onClick={onDecline}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveCallOverlay({ call, localStream, remoteStream, onEnd, toggleMute, toggleVideo, isMuted, isVideoOff }) {
  if (!call) return null;
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className={`chat-call-overlay ${call.type === 'video' ? 'video-mode' : ''}`}>
      {call.type === "video" ? (
        <div className="chat-call-video-container">
          <video ref={remoteVideoRef} className="chat-call-video remote" autoPlay playsInline />
          <div className="chat-call-video-local-wrap">
            <video ref={localVideoRef} className="chat-call-video local" autoPlay playsInline muted />
          </div>
        </div>
      ) : (
        <audio ref={remoteVideoRef} autoPlay />
      )}
      
      <div className={`chat-call-modal ${call.type === 'video' ? 'floating-controls' : ''}`}>
        {call.type !== "video" && (
          <>
            <div className="chat-call-avatar-wrap">
              <Avatar name={call.target.name} email={call.target.email} photo={call.target.photo} size={92} className="chat-call-avatar" />
            </div>
            <h3>{call.target.name || call.target.email}</h3>
          </>
        )}
        <p>{call.type === "video" ? "Video calling" : "Voice calling"} · {call.phaseLabel}</p>
        <strong>{call.durationLabel}</strong>
        <div className="chat-call-controls">
          <button type="button" className={`chat-mini-action-btn ${isMuted ? 'danger' : ''}`} onClick={toggleMute}>
            {isMuted ? "Unmute" : "Mute"}
          </button>
          {call.type === "video" && (
            <button type="button" className={`chat-mini-action-btn ${isVideoOff ? 'danger' : ''}`} onClick={toggleVideo}>
              {isVideoOff ? "Start Video" : "Stop Video"}
            </button>
          )}
          <button type="button" className="chat-mini-action-btn danger" onClick={() => onEnd("ended")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
            End
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Chat Component ───────────────────────────────────────────────────────
function Chat({ user, setUser, theme, toggleTheme }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [_usersError, setUsersError] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // Photo modal only opened from Settings (canEditProfile = true)
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [modalUser, setModalUser] = useState(null);
  const [canEditProfile, setCanEditProfile] = useState(false);

  // Only settings can open editable photo modal; contact clicks show read-only view
  const handleOpenProfileModal = (target = null, edit = false) => {
    setModalUser(target);
    setCanEditProfile(edit);
    setShowProfileModal(true);
  };

  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [_mediaUploading, setMediaUploading] = useState(false);
  const [_highlightedMsgIndex, setHighlightedMsgIndex] = useState(null);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [readBy, setReadBy] = useState(new Set());
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [unreadMap, setUnreadMap] = useState({});
  const [_flashEmail, setFlashEmail] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [composerNotice, setComposerNotice] = useState({ type: "", text: "" });
  const [freshMessageId, setFreshMessageId] = useState(null);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [activeTab, setActiveTab] = useState("chats");

  // Status state
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [statusText, setStatusText] = useState(user?.status?.text || "");
  const [statusFile, setStatusFile] = useState(null);
  const [statusUploading, setStatusUploading] = useState(false);
  const [viewingStatusUser, setViewingStatusUser] = useState(null);

  const [settingsDraft, setSettingsDraft] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    bio: user?.bio || "",
    privacy: {
      lastSeen: user?.privacy?.lastSeen || "everyone",
      profilePhoto: user?.privacy?.profilePhoto || "everyone",
      readReceipts: user?.privacy?.readReceipts !== false,
      restrictedEmails: user?.privacy?.restrictedEmails || [],
    },
    notifications: {
      messagePreview: user?.notifications?.messagePreview !== false,
      sound: user?.notifications?.sound !== false,
      vibrate: user?.notifications?.vibrate !== false,
      desktopAlerts: user?.notifications?.desktopAlerts !== false,
    },
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [callHistory, setCallHistory] = useState(() => {
    try {
      const raw = localStorage.getItem("chatapp-call-history");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [activeCall, setActiveCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  
  // WebRTC Call State
  const [incomingCall, setIncomingCall] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isCallVideoOff, setIsCallVideoOff] = useState(false);
  
  const peerConnectionRef = useRef(null);
  const ICE_SERVERS = useMemo(() => ({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  }), []);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const callStreamRef = useRef(null);
  const callPhaseTimerRef = useRef(null);
  const recordingTimerRef = useRef(null);

  const { showToast } = useToast();
  const { notify } = useNotifications({ soundEnabled: settingsDraft?.notifications?.sound !== false });
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
  const usersRef = useRef([]);
  const freshMessageTimerRef = useRef(null);
  const copiedMessageTimerRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { usersRef.current = users; }, [users]);

  useEffect(() => {
    if (user?.email) {
      setSettingsDraft({
        name: user?.name || "",
        phone: user?.phone || "",
        bio: user?.bio || "",
        privacy: {
          lastSeen: user?.privacy?.lastSeen || "everyone",
          profilePhoto: user?.privacy?.profilePhoto || "everyone",
          readReceipts: user?.privacy?.readReceipts !== false,
          restrictedEmails: user?.privacy?.restrictedEmails || [],
        },
        notifications: {
          messagePreview: user?.notifications?.messagePreview !== false,
          sound: user?.notifications?.sound !== false,
          vibrate: user?.notifications?.vibrate !== false,
          desktopAlerts: user?.notifications?.desktopAlerts !== false,
        },
      });
    }
  }, [user]);

  useEffect(() => {
    try { localStorage.setItem("chatapp-call-history", JSON.stringify(callHistory)); }
    catch { /* ignore */ }
  }, [callHistory]);

  useEffect(() => {
    if (!composerNotice.text) return undefined;
    const timer = window.setTimeout(() => setComposerNotice({ type: "", text: "" }), 2800);
    return () => window.clearTimeout(timer);
  }, [composerNotice]);

  // ── Socket ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket"], withCredentials: true, autoConnect: true });
    socketRef.current = socket;

    const register = () => {
      if (userRef.current?.email) socket.emit("register", userRef.current.email);
      setConnectionStatus("online");
    };

    socket.on("connect", register);
    socket.on("disconnect", () => setConnectionStatus("offline"));
    socket.on("reconnecting", () => setConnectionStatus("connecting"));
    socket.on("connect_error", () => setConnectionStatus("offline"));
    if (socket.connected) register();

    socket.on("users_update", (data) => { setUsers(Array.isArray(data) ? data : []); });

    // ── Real-time online/offline presence ──────────────────────────────────────
    socket.on("user_online", ({ email }) => {
      setUsers((prev) => prev.map((u) => u.email === email ? { ...u, isOnline: true, lastSeen: "Online" } : u));
    });
    socket.on("user_offline", ({ email, lastSeen }) => {
      setUsers((prev) => prev.map((u) => u.email === email ? { ...u, isOnline: false, lastSeen } : u));
    });

    socket.on("private_message", (incomingMessage) => {
      setMessages((prev) => {
        const normalizedIncoming = normalizeMessage(incomingMessage);
        const isDuplicate = prev.some(
          (m) =>
            (m._id && normalizedIncoming._id && m._id === normalizedIncoming._id) ||
            (m.clientTempId && normalizedIncoming.clientTempId && m.clientTempId === normalizedIncoming.clientTempId) ||
            (m.sender === normalizedIncoming.sender && m.receiver === normalizedIncoming.receiver &&
             m.time === normalizedIncoming.time && m.text === normalizedIncoming.text && m.mediaUrl === normalizedIncoming.mediaUrl)
        );
        return isDuplicate ? prev : [...prev, normalizedIncoming];
      });
      setFreshMessageId(getMessageId(incomingMessage));
      setIsTyping(false);

      const senderEmail = incomingMessage.sender;
      if (senderEmail && senderEmail !== userRef.current?.email) {
        const isViewingConversation = activeSelectedUserRef.current?.email === senderEmail;
        // ── Push notification + bleep on every incoming message ──
        const senderName = incomingMessage.senderName ||
          [...(usersRef.current || [])].find(u => u.email === senderEmail)?.name ||
          senderEmail.split("@")[0];
        const msgPreview = incomingMessage.text ||
          (incomingMessage.mediaUrl ? "📎 Media" : "New message");
        notify({
          title: senderName,
          body: msgPreview,
          tag: `msg-${senderEmail}`,
        });
        if (isViewingConversation) {
          shouldScrollRef.current = true;
          socket.emit("read_receipt", { to: senderEmail, from: userRef.current.email });
        } else {
          const incomingTime = formatMsgTime(incomingMessage.createdAt || incomingMessage.time);
          setUnreadMap((prev) => ({
            ...prev,
            [senderEmail]: {
              count: (prev[senderEmail]?.count || 0) + 1,
              lastText: incomingMessage.text || (incomingMessage.mediaUrl ? "📎 Media" : ""),
              lastTime: incomingTime,
            },
          }));
          setFlashEmail(senderEmail);
          setTimeout(() => setFlashEmail((cur) => cur === senderEmail ? null : cur), 800);
        }
      }
    });

    socket.on("message_saved", (savedMessage) => {
      const normalizedSaved = normalizeMessage(savedMessage);
      setFreshMessageId(getMessageId(normalizedSaved));
      setMessages((prev) => {
        const existingIndex = prev.findIndex(
          (m) =>
            (normalizedSaved.clientTempId && m.clientTempId === normalizedSaved.clientTempId) ||
            (normalizedSaved._id && m._id === normalizedSaved._id)
        );
        if (existingIndex === -1) return [...prev, normalizedSaved];
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...normalizedSaved, deliveryState: "sent" };
        return next;
      });
    });

    socket.on("read_receipt", ({ from }) => {
      setReadBy((prev) => new Set([...prev, from]));
    });

    // ── Reaction received — update local state with MongoDB-persisted reactions ──
    socket.on("message_reaction", ({ messageId, reactions: nextReactions }) => {
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((entry) =>
          entry._id === messageId
            ? { ...entry, reactions: nextReactions || {}, deliveryState: entry.deliveryState || "sent" }
            : entry
        )
      );
    });

    // ── WebRTC Signaling ──
    socket.on("call_offer", ({ from, offer, type }) => {
      const callerUser = usersRef.current.find(u => u.email === from) || { email: from, name: from };
      setIncomingCall({ from, target: callerUser, offer, type });
    });

    socket.on("call_answer", async ({ answer }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (err) {
        console.error("Failed to set remote description:", err);
      }
    });

    socket.on("ice_candidate", async ({ candidate }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error("Failed to add ICE candidate:", err);
      }
    });

    const cleanupCallState = () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (callStreamRef.current) {
        callStreamRef.current.getTracks().forEach((track) => track.stop());
        callStreamRef.current = null;
      }
      setRemoteStream(null);
      setIncomingCall(null);
      setActiveCall(null);
      setCallDuration(0);
      setIsCallMuted(false);
      setIsCallVideoOff(false);
    };

    socket.on("call_ended", cleanupCallState);
    socket.on("call_rejected", cleanupCallState);

    return () => {
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(typingIndicatorTimeoutRef.current);
      clearTimeout(freshMessageTimerRef.current);
      clearTimeout(copiedMessageTimerRef.current);
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
          if (response.status === 503 && attempt < 4) { setTimeout(() => { if (!cancelled) loadUsers(attempt + 1); }, 2000 * attempt); return; }
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
        const data = await requestJson(`${SERVER_URL}/api/messages/${encodeURIComponent(user.email)}`);
        if (!cancelled && Array.isArray(data)) {
          const normalizedMessages = data.map((entry) => normalizeMessage(entry));
          setMessages(normalizedMessages);
          const nextUnreadMap = {};
          for (const entry of normalizedMessages) {
            if (entry.receiver !== user.email) continue;
            const readByList = Array.isArray(entry.readBy) ? entry.readBy : [];
            if (readByList.includes(user.email)) continue;
            nextUnreadMap[entry.sender] = {
              count: (nextUnreadMap[entry.sender]?.count || 0) + 1,
              lastText: entry.text || (entry.mediaUrl ? "📎 Media" : ""),
              lastTime: formatMsgTime(entry.createdAt || entry.time),
            };
          }
          setUnreadMap(nextUnreadMap);
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

  // ── Sync viewingStatusUser with users array ─────────────────────────────────
  useEffect(() => {
    if (viewingStatusUser) {
      const match = users.find(u => u.email === viewingStatusUser.email);
      if (match && JSON.stringify(match.status) !== JSON.stringify(viewingStatusUser.status)) {
        setViewingStatusUser(match);
      }
    }
  }, [users, viewingStatusUser]);

  // Clear viewing status when switching tabs
  useEffect(() => {
    if (activeTab !== "status") {
      setViewingStatusUser(null);
    }
  }, [activeTab]);

  // ── Smart scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Use a small timeout to ensure DOM has rendered new messages
    const timer = setTimeout(() => {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const nearBottom = distFromBottom < 120;
      
      if (shouldScrollRef.current || nearBottom) {
        // Use "auto" (instant) scroll when switching users/opening chat
        // Use "smooth" scroll when receiving new messages while already at bottom
        bottomRef.current?.scrollIntoView({ 
          behavior: shouldScrollRef.current ? "auto" : "smooth", 
          block: "end" 
        });
      }
      shouldScrollRef.current = false;
    }, 60);

    return () => clearTimeout(timer);
  }, [messages, selectedUser, isTyping]);

  // ── Scroll-to-bottom FAB visibility ──────────────────────────────────────────
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollBtn(dist > 200);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [selectedUser]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    if (!freshMessageId) return undefined;
    clearTimeout(freshMessageTimerRef.current);
    freshMessageTimerRef.current = window.setTimeout(() => setFreshMessageId(null), 1600);
    return () => window.clearTimeout(freshMessageTimerRef.current);
  }, [freshMessageId]);

  useEffect(() => {
    if (!copiedMessageId) return undefined;
    clearTimeout(copiedMessageTimerRef.current);
    copiedMessageTimerRef.current = window.setTimeout(() => setCopiedMessageId(null), 1400);
    return () => window.clearTimeout(copiedMessageTimerRef.current);
  }, [copiedMessageId]);

  // ── Live browser-tab title badge (unread count) ────────────────────────────
  useEffect(() => {
    const totalUnread = Object.values(unreadMap).reduce((sum, v) => sum + (v?.count || 0), 0);
    document.title = totalUnread > 0 ? `(${totalUnread}) Hello Hub` : "Hello Hub";
    return () => { document.title = "Hello Hub"; };
  }, [unreadMap]);

  useEffect(() => {
    if (!activeCall) return undefined;
    const interval = window.setInterval(() => {
      setCallDuration(Math.max(0, Math.floor((Date.now() - activeCall.startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeCall]);

  useEffect(() => () => {
    clearTimeout(callPhaseTimerRef.current);
    clearInterval(recordingTimerRef.current);
    if (callStreamRef.current) {
      callStreamRef.current.getTracks().forEach((track) => track.stop());
      callStreamRef.current = null;
    }
  }, []);

  // ── Close emoji picker on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!showEmojiPicker) return undefined;
    const handler = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) setShowEmojiPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmojiPicker]);

  // ── Close reaction picker on outside click ────────────────────────────────────
  useEffect(() => {
    if (!reactionPickerFor) return undefined;
    const handler = (e) => {
      if (e.target.closest?.(".chat-reaction-wrap")) return;
      setReactionPickerFor(null);
    };
    const t = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", handler); };
  }, [reactionPickerFor]);

  // ── Send read receipt when conversation is opened ─────────────────────────────
  useEffect(() => {
    if (selectedUser?.email && socketRef.current) {
      socketRef.current.emit("read_receipt", { to: selectedUser.email, from: user?.email });
      setMessages((prev) =>
        prev.map((entry) =>
          entry.sender === selectedUser.email && entry.receiver === user?.email
            ? { ...entry, readBy: Array.isArray(entry.readBy) && entry.readBy.includes(user?.email) ? entry.readBy : [...(Array.isArray(entry.readBy) ? entry.readBy : []), user?.email].filter(Boolean) }
            : entry
        )
      );
    }
  }, [selectedUser?.email, user?.email]);

  useEffect(() => {
    const syncReadReceipt = () => {
      if (!selectedUser?.email || !socketRef.current || document.visibilityState !== "visible") return;
      socketRef.current.emit("read_receipt", { to: selectedUser.email, from: user?.email });
    };
    window.addEventListener("focus", syncReadReceipt);
    document.addEventListener("visibilitychange", syncReadReceipt);
    return () => {
      window.removeEventListener("focus", syncReadReceipt);
      document.removeEventListener("visibilitychange", syncReadReceipt);
    };
  }, [selectedUser?.email, user?.email]);

  // ── Derived values ─────────────────────────────────────────────────────────────
  const activeSelectedUser = useMemo(
    () => selectedUser?.email ? users.find((u) => u.email === selectedUser.email) || selectedUser : null,
    [selectedUser, users]
  );

  useEffect(() => { activeSelectedUserRef.current = activeSelectedUser; }, [activeSelectedUser]);

  useEffect(() => {
    if (!user?.email || !activeSelectedUser?.email) return;
    const draftKey = `chatapp-draft||${user.email}||${activeSelectedUser.email}`;
    try {
      if (message.trim()) localStorage.setItem(draftKey, message);
      else localStorage.removeItem(draftKey);
    } catch { /* ignore */ }
  }, [activeSelectedUser?.email, message, user?.email]);

  const filteredUsers = useMemo(() => {
    const userMetadata = new Map();
    for (const entry of messages) {
      const otherEmail = entry.sender === user?.email ? entry.receiver : entry.sender;
      if (!otherEmail || otherEmail === user?.email) continue;
      const entryTime = new Date(entry.createdAt || entry.updatedAt || entry.time || 0).getTime() || 0;
      const current = userMetadata.get(otherEmail);
      if (!current || entryTime > current.time) {
        userMetadata.set(otherEmail, {
          time: entryTime,
          text: entry.text || (entry.mediaUrl ? "📎 Media" : ""),
          formattedTime: formatMsgTime(entry.createdAt || entry.time),
        });
      }
    }
    const base = users.filter((u) => {
      if (!u?.email || u.email === user?.email) return false;
      const q = search.toLowerCase();
      return u.email.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
    });
    return base.map(u => ({ ...u, lastMsg: userMetadata.get(u.email) })).sort((a, b) => {
      const aHasUnread = (unreadMap[a.email]?.count || 0) > 0;
      const bHasUnread = (unreadMap[b.email]?.count || 0) > 0;
      if (aHasUnread !== bHasUnread) return aHasUnread ? -1 : 1;
      const at = a.lastMsg?.time || 0;
      const bt = b.lastMsg?.time || 0;
      if (at !== bt) return bt - at;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }, [messages, search, unreadMap, user?.email, users]);

  useEffect(() => {
    if (search.trim() || isLoadingUsers || filteredUsers.length === 0) return;
    if (selectedUser?.email && users.some((entry) => entry.email === selectedUser.email)) return;
    const nextUser = filteredUsers[0];
    shouldScrollRef.current = true;
    let nextDraft = "";
    if (user?.email && nextUser?.email) {
      const draftKey = `chatapp-draft||${user.email}||${nextUser.email}`;
      try { nextDraft = localStorage.getItem(draftKey) || ""; }
      catch { nextDraft = ""; }
    }
    if (nextDraft !== message || nextUser?.email !== selectedUser?.email) {
      setMessage(nextDraft);
      setSelectedUser(nextUser);
    }
  }, [filteredUsers, isLoadingUsers, search, selectedUser?.email, user?.email, users, message]);

  const conversationMessages = useMemo(
    () => messages.filter((m) =>
      activeSelectedUser &&
      ((m.sender === user?.email && m.receiver === activeSelectedUser.email) ||
       (m.sender === activeSelectedUser.email && m.receiver === user?.email))
    ),
    [activeSelectedUser, messages, user?.email]
  );

  const messageItems = useMemo(() => {
    const items = [];
    let lastLabel = null;
    conversationMessages.forEach((entry, index) => {
      const label = getDateLabel(entry.time);
      if (label && label !== lastLabel) { items.push({ type: "date", label }); lastLabel = label; }
      items.push({ type: "msg", entry, index });
    });
    return items;
  }, [conversationMessages]);

  const lastOwnMsgIsRead = useMemo(() => {
    if (!activeSelectedUser) return false;
    return readBy.has(activeSelectedUser.email);
  }, [readBy, activeSelectedUser]);

  const callContacts = useMemo(() => filteredUsers.slice(0, 8), [filteredUsers]);

  const callRecords = useMemo(
    () => callHistory.map((entry) => ({
      ...entry,
      durationLabel: entry.duration > 0 ? `${Math.floor(entry.duration / 60)}m ${String(entry.duration % 60).padStart(2, "0")}s` : "No answer",
      timeLabel: new Date(entry.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    })),
    [callHistory]
  );

  const settingsStats = useMemo(() => ({
    unreadCount: Object.values(unreadMap).reduce((sum, entry) => sum + (entry?.count || 0), 0),
    statusCount: users.filter((entry) => entry.email !== user?.email && entry.status?.mediaUrl).length,
    blockedCount: user?.blockedUsers?.length || 0,
    pinnedCount: user?.pinnedChats?.length || 0,
  }), [unreadMap, user?.blockedUsers?.length, user?.email, user?.pinnedChats?.length, users]);

  const activeCallView = useMemo(() => {
    if (!activeCall) return null;
    return {
      ...activeCall,
      durationLabel: `${Math.floor(callDuration / 60)}:${String(callDuration % 60).padStart(2, "0")}`,
      phaseLabel: activeCall.phase === "connecting" ? "Connecting" : "Live",
    };
  }, [activeCall, callDuration]);

  // ── Handlers ────────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try { await signOut(auth); showToast("Signed out successfully", "info"); }
    catch { /* ignore */ }
    finally {
      setSelectedUser(null); setMessage(""); setMessages([]); setUnreadMap({}); setUser(null);
      navigate("/login", { replace: true });
    }
  };

  const handleStatusUpdate = async () => {
    if (!user?.email) return;
    setStatusUploading(true);
    try {
      const formData = new FormData();
      formData.append("email", user.email);
      formData.append("text", statusText);
      if (statusFile) formData.append("file", statusFile);
      const response = await fetch(`${SERVER_URL}/api/status`, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update status");
      setUser((prev) => ({ ...prev, statuses: data.statuses }));
      setIsEditingStatus(false);
      setStatusFile(null);
      setStatusText("");
      showToast("Status updated successfully", "success");
    } catch (err) {
      showToast(err.message || "Failed to update status", "error");
    } finally {
      setStatusUploading(false);
    }
  };

  const handleStatusLike = async (targetUserEmail, statusId) => {
    if (!user?.email) return;

    // --- OPTIMISTIC UPDATE ---
    const oldUsers = [...users];
    setUsers(prev => prev.map(u => {
      if (u.email === targetUserEmail) {
        const nextStatuses = (u.statuses || []).map(s => {
          if (s._id === statusId || (!statusId && s === u.statuses[u.statuses.length - 1])) {
            const isLiked = s.likes?.includes(user.email);
            const nextLikes = isLiked 
              ? s.likes.filter(e => e !== user.email)
              : [...(s.likes || []), user.email];
            return { ...s, likes: nextLikes };
          }
          return s;
        });
        return { ...u, statuses: nextStatuses };
      }
      return u;
    }));
    // -------------------------

    try {
      const response = await fetch(`${SERVER_URL}/api/status/${encodeURIComponent(targetUserEmail)}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ likerEmail: user.email, statusId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setUsers(oldUsers);
        throw new Error(data.error || "Failed to like status");
      }
    } catch (err) {
      setUsers(oldUsers);
      showToast(err.message, "error");
    }
  };

  const handleStatusView = async (targetUserEmail, statusId) => {
    if (!user?.email || !targetUserEmail || user.email === targetUserEmail) return;
    try {
      await fetch(`${SERVER_URL}/api/status/${encodeURIComponent(targetUserEmail)}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerEmail: user.email, statusId }),
      });
    } catch (err) {
      console.error("View track error:", err);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: "audio/webm" });
        sendMediaMessage(file);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      showToast("Could not access microphone", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingSeconds(0);
      clearInterval(recordingTimerRef.current);
    }
  };

  const handleSelectUser = (entry) => {
    shouldScrollRef.current = true;
    let nextDraft = "";
    if (user?.email && entry?.email) {
      const draftKey = `chatapp-draft||${user.email}||${entry.email}`;
      try { nextDraft = localStorage.getItem(draftKey) || ""; }
      catch { nextDraft = ""; }
    }
    setSelectedUser(entry);
    setMessage(nextDraft);
    setUnreadMap((prev) => { if (!prev[entry.email]) return prev; const next = { ...prev }; delete next[entry.email]; return next; });
    setFlashEmail((cur) => cur === entry.email ? null : cur);
    setHighlightedMsgIndex(null);
    setReplyingTo(null);
  };

  const sendMessage = () => {
    if (!message.trim() || !activeSelectedUser || !user?.email) return;
    if (!socketRef.current?.connected) {
      setComposerNotice({ type: "error", text: "Connection lost. Reconnect before sending." });
      return;
    }
    shouldScrollRef.current = true;
    const clientTempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const msgData = {
      clientTempId,
      text: message.trim(),
      sender: user.email,
      receiver: activeSelectedUser.email,
      time: new Date().toISOString(),
      deliveryState: "sending",
    };
    if (replyingTo) {
      msgData.replyTo = {
        messageId: replyingTo.messageId || null,
        senderName: replyingTo.sender === user?.email ? "You" : activeSelectedUser.name || activeSelectedUser.email,
        text: replyingTo.text,
        mediaUrl: replyingTo.mediaUrl,
        mediaType: replyingTo.mediaType,
      };
    }
    socketRef.current?.emit("private_message", { to: activeSelectedUser.email, message: msgData });
    socketRef.current?.emit("stop_typing", { to: activeSelectedUser.email, from: user.email });
    setMessages((prev) => [...prev, normalizeMessage(msgData)]);
    setFreshMessageId(clientTempId);
    setMessage("");
    setIsTyping(false);
    setReplyingTo(null);
  };

  const handleMessageKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); }
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
    if (!socketRef.current?.connected) {
      setComposerNotice({ type: "error", text: "Connection lost. Reconnect before sending media." });
      return;
    }
    setMediaUploading(true);
    try {
      const formData = new FormData();
      formData.append("sender", sender.email);
      formData.append("receiver", receiver.email);
      formData.append("file", file);
      const res = await fetch(`${SERVER_URL}/api/media/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      const clientTempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const msgData = {
        clientTempId,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        filename: data.filename,
        sender: sender.email,
        receiver: receiver.email,
        time: new Date().toISOString(),
        deliveryState: "sending",
      };
      if (replyingTo) {
        msgData.replyTo = {
          messageId: replyingTo.messageId || null,
          senderName: replyingTo.sender === user?.email ? "You" : receiver.name || receiver.email,
          text: replyingTo.text,
          mediaUrl: replyingTo.mediaUrl,
          mediaType: replyingTo.mediaType,
        };
      }
      socketRef.current?.emit("private_message", { to: receiver.email, message: msgData });
      setMessages((prev) => [...prev, normalizeMessage(msgData)]);
      setFreshMessageId(clientTempId);
      setReplyingTo(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Media upload error:", err);
      setComposerNotice({ type: "error", text: err?.message || "Media upload failed" });
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
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length); });
  };

  const handlePhotoUpdated = (newPhotoUrl) => {
    const resolvedPhoto = resolveAssetUrl(newPhotoUrl);
    setUser((prev) => ({ ...prev, photo: resolvedPhoto }));
    setUsers((prev) => prev.map((entry) => entry.email === user?.email ? { ...entry, photo: resolvedPhoto } : entry));
    showToast("Profile picture updated", "success");
  };

  // ── Reaction handler — emits to socket, server persists to MongoDB ─────────────
  const handleReaction = (messageId, emoji) => {
    if (!messageId || !activeSelectedUser?.email || !user?.email) {
      setComposerNotice({ type: "error", text: "Wait for the message to finish saving before reacting." });
      return;
    }
    if (!socketRef.current?.connected) {
      setComposerNotice({ type: "error", text: "Connection lost. Reconnect before updating reactions." });
      return;
    }
    socketRef.current?.emit("message_reaction", {
      to: activeSelectedUser.email,
      messageId,
      emoji,
      by: user.email,
    });
    // Optimistic UI update
    setMessages((prev) =>
      prev.map((entry) => {
        if (entry._id !== messageId) return entry;
        const reactions = { ...(entry.reactions || {}) };
        const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
        if (users.includes(user.email)) {
          reactions[emoji] = users.filter((e) => e !== user.email);
          if (!reactions[emoji].length) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, user.email];
        }
        return { ...entry, reactions };
      })
    );
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

  const handleDraftChange = (path, value) => {
    const keys = path.split(".");
    setSettingsDraft((prev) => {
      const next = { ...prev };
      let cursor = next;
      for (let i = 0; i < keys.length - 1; i += 1) { const key = keys[i]; cursor[key] = { ...cursor[key] }; cursor = cursor[key]; }
      cursor[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const handleSaveSettings = async () => {
    if (!user?.email) return;
    setSettingsSaving(true);
    try {
      const data = await requestJson(`${SERVER_URL}/api/profile/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, name: settingsDraft.name, phone: settingsDraft.phone, bio: settingsDraft.bio, privacy: settingsDraft.privacy, notifications: settingsDraft.notifications }),
      });
      if (data?.user) {
        setUser((prev) => ({ ...prev, ...data.user }));
        setUsers((prev) => prev.map((entry) => (entry.email === data.user.email ? { ...entry, ...data.user } : entry)));
      }
      showToast("Settings saved successfully", "success");
    } catch (error) {
      showToast(error.message || "Unable to save settings", "error");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleStartCall = async (type, contact = activeSelectedUser) => {
    if (!contact?.email) { showToast("Select a contact to start a call", "info"); return; }
    try {
      if (callStreamRef.current) { callStreamRef.current.getTracks().forEach((track) => track.stop()); callStreamRef.current = null; }
      if (peerConnectionRef.current) { peerConnectionRef.current.close(); }
      
      const constraints = type === "video" ? { audio: true, video: true } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      callStreamRef.current = stream;
      
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;
      
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        setActiveCall((prev) => (prev ? { ...prev, phase: "live" } : prev));
      };
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit("ice_candidate", { to: contact.email, from: user.email, candidate: event.candidate });
        }
      };
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socketRef.current?.emit("call_offer", { to: contact.email, from: user.email, offer, type });
      
      setCallDuration(0);
      setIsCallMuted(false);
      setIsCallVideoOff(false);
      setActiveCall({ type, target: contact, startedAt: Date.now(), phase: "connecting" });
    } catch (error) {
      showToast(error?.message || "Microphone or camera permission was denied", "error");
    }
  };

  const handleAcceptCall = async () => {
    if (!incomingCall) return;
    try {
      const type = incomingCall.type;
      const contact = incomingCall.target;
      
      const constraints = type === "video" ? { audio: true, video: true } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      callStreamRef.current = stream;
      
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;
      
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit("ice_candidate", { to: incomingCall.from, from: user.email, candidate: event.candidate });
        }
      };
      
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socketRef.current?.emit("call_answer", { to: incomingCall.from, from: user.email, answer });
      
      setCallDuration(0);
      setIsCallMuted(false);
      setIsCallVideoOff(false);
      setActiveCall({ type, target: contact, startedAt: Date.now(), phase: "live" });
      setIncomingCall(null);
    } catch (error) {
      showToast("Could not access camera/microphone to accept call.", "error");
      socketRef.current?.emit("call_rejected", { to: incomingCall.from, from: user.email });
      setIncomingCall(null);
    }
  };

  const handleDeclineCall = () => {
    if (incomingCall) {
      socketRef.current?.emit("call_rejected", { to: incomingCall.from, from: user.email });
      setIncomingCall(null);
    }
  };

  const handleEndCall = (status = "ended", emit = true) => {
    setCallHistory((prev) => {
      if (!activeCall) return prev;
      const nextEntry = { id: `call-${Date.now()}`, name: activeCall.target.name || activeCall.target.email, email: activeCall.target.email, type: activeCall.type, status, duration: callDuration, startedAt: activeCall.startedAt };
      return [nextEntry, ...prev].slice(0, 20);
    });
    
    if (emit && activeCall?.target?.email) {
      socketRef.current?.emit("call_ended", { to: activeCall.target.email, from: user.email });
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (callStreamRef.current) {
      callStreamRef.current.getTracks().forEach((track) => track.stop());
      callStreamRef.current = null;
    }
    setRemoteStream(null);
    setActiveCall(null);
    setCallDuration(0);
    setIsCallMuted(false);
    setIsCallVideoOff(false);
  };
  
  const toggleMuteCall = () => {
    if (callStreamRef.current) {
      const audioTrack = callStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsCallMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideoCall = () => {
    if (callStreamRef.current) {
      const videoTrack = callStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCallVideoOff(!videoTrack.enabled);
      }
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="chat-shell">
      {showProfileModal && (
        <ProfilePhotoModal
          user={user}
          targetUser={modalUser}
          canEdit={canEditProfile}
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

      {/* ── Offline / Reconnecting Banner ── */}
      {connectionStatus !== "online" && (
        <div className={`conn-banner conn-banner-${connectionStatus}`} role="alert">
          {connectionStatus === "offline" ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
              <span>No internet connection — messages will be sent once you're back online</span>
            </>
          ) : (
            <>
              <span className="conn-banner-spinner" />
              <span>Reconnecting…</span>
            </>
          )}
        </div>
      )}

      <section className={`chat-layout ${activeTab !== "chats" ? "full-page-layout" : ""}`}>
        {activeTab === "chats" ? (
          <>
            {/* ── Sidebar ── */}
            <aside className="chat-sidebar">
              <div className="chat-sidebar-header">
                <div
                  className="chat-self-avatar-wrap"
                  title="Your profile (edit photo in Settings)"
                  onClick={() => setActiveTab("settings")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setActiveTab("settings")}
                  style={{ cursor: "pointer" }}
                >
                  <Avatar name={user?.name} email={user?.email} photo={user?.photo} size={40} className="chat-self-avatar" />
                </div>

                <div className="chat-sidebar-actions">
                  <span
                    className={`chat-conn-dot chat-conn-dot-${connectionStatus}`}
                    title={connectionStatus === "online" ? "Connected" : connectionStatus === "offline" ? "Disconnected" : "Connecting…"}
                  />
                  <button type="button" className="chat-nav-icon-btn" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
                    {theme === "dark"
                      ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                      : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3c0 .28 0 .57.02.85A7 7 0 0 0 20.15 12c.28 0 .57 0 .85-.02z"/></svg>
                    }
                  </button>
                  <button type="button" className="chat-nav-icon-btn" onClick={() => setActiveTab("settings")} title="Settings">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.49.74.83 1.3.83H21a2 2 0 1 1 0 4h-.09c-.56 0-1.1.34-1.51.83z"/></svg>
                  </button>
                  <button type="button" className="chat-nav-icon-btn" onClick={handleLogout} title="Logout">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  </button>
                </div>
              </div>

              <div className="chat-search-container">
                <div className="chat-search-wrap">
                  <svg className="chat-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    type="text"
                    placeholder="Search or start new chat"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="chat-user-list">
                {isLoadingUsers ? (
                  <div className="chat-loading-state">
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/></svg>
                    Loading chats...
                  </div>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map((entry) => {
                    const isActive = activeSelectedUser?.email === entry.email;
                    const unread = unreadMap[entry.email];
                    const hasUnread = !isActive && unread?.count > 0;
                    return (
                      <button
                        key={entry.email}
                        type="button"
                        className={`chat-user-card ${isActive ? "active" : ""} ${hasUnread ? "unread" : ""}`}
                        onClick={() => handleSelectUser(entry)}
                      >
                        <div className="chat-avatar-wrap" onClick={(e) => { e.stopPropagation(); handleOpenProfileModal(entry, false); }} title="View profile photo">
                          <Avatar name={entry.name} email={entry.email} photo={entry.photo} size={56} className="chat-avatar" />
                          {entry.isOnline && <span className="chat-online-dot-small" />}
                        </div>
                        <div className="chat-user-info">
                          <div className="chat-user-info-top">
                            <span className="chat-user-name">{entry.name || entry.email}</span>
                            <span className="chat-user-time">
                              {hasUnread ? unread.lastTime : (entry.lastMsg?.formattedTime || (entry.lastSeen === "Online" ? "Online" : formatLastSeen(entry.lastSeen)))}
                            </span>
                          </div>
                          <div className="chat-user-info-bottom">
                            <span className="chat-user-message">
                              {hasUnread ? unread.lastText : (entry.lastMsg?.text || entry.status?.text || "Hey there! I am using Hello Hub.")}
                            </span>
                            {hasUnread && <span className="chat-unread-badge">{unread.count > 9 ? "9+" : unread.count}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="chat-empty-state">No chats found</div>
                )}
              </div>
            </aside>

            {/* ── Main Chat Panel ── */}
            <main className="chat-panel">
              {activeSelectedUser ? (
                <>
                  <div className="chat-panel-header">
                    <div className="chat-panel-header-left">
                      <div className="chat-avatar-clickable" onClick={() => handleOpenProfileModal(activeSelectedUser, false)} title="View profile photo" style={{ cursor: "pointer" }}>
                        <Avatar name={activeSelectedUser.name} email={activeSelectedUser.email} photo={activeSelectedUser.photo} size={40} />
                      </div>
                      <div className="chat-active-user-info">
                        <h3>{activeSelectedUser.name || activeSelectedUser.email}</h3>
                        <p className={activeSelectedUser.isOnline ? "online" : ""}>
                          {isTyping
                            ? <span className="typing-status"><span className="typing-dots-mini"><span/><span/><span/></span> typing…</span>
                            : activeSelectedUser.isOnline
                            ? <span className="online-now-status"><span className="online-pulse-dot"/>Online</span>
                            : `last seen ${formatLastSeen(activeSelectedUser.lastSeen)}`}
                        </p>
                      </div>
                    </div>
                    <div className="chat-panel-header-actions">
                      <button type="button" className="chat-header-icon-btn" onClick={() => handleStartCall("voice", activeSelectedUser)} title="Voice call">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.46-1.24a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92z"/></svg>
                      </button>
                      <button type="button" className="chat-header-icon-btn" onClick={() => handleStartCall("video", activeSelectedUser)} title="Video call">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      </button>
                      <button type="button" className="chat-header-icon-btn" onClick={() => setShowMsgSearch(true)} title="Search messages">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      </button>
                    </div>
                  </div>

                  <div className="chat-messages-container" ref={messagesContainerRef}>
                    <div className="chat-messages-bg" />

                    {/* ── Scroll-to-bottom FAB ── */}
                    {showScrollBtn && (
                      <button
                        type="button"
                        className="scroll-to-bottom-fab"
                        onClick={scrollToBottom}
                        aria-label="Scroll to latest message"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        {settingsStats.unreadCount > 0 && (
                          <span className="scroll-fab-badge">{settingsStats.unreadCount}</span>
                        )}
                      </button>
                    )}

                    <div className="chat-messages-list">
                      {messageItems.map((item, itemIdx) => {
                        if (item.type === "date") {
                          return <div key={`date-${itemIdx}`} className="chat-date-separator"><span>{item.label}</span></div>;
                        }
                        const { entry, index } = item;
                        const isOwn = entry.sender === user?.email;
                        const key = getMessageId(entry, index);
                        const isPending = entry.deliveryState === "sending" && !entry._id;
                        const reactionEntries = entry.reactions ? Object.entries(entry.reactions) : [];

                        return (
                          <div key={key} data-msgindex={index} className={`chat-bubble-row ${isOwn ? "own" : "received"}`}>
                            <div className={`chat-bubble ${isOwn ? "own" : ""} ${freshMessageId === key ? "fresh" : ""}`}>
                              {!isOwn && <span className="chat-bubble-sender">{activeSelectedUser.name || activeSelectedUser.email}</span>}

                              {/* ── Action buttons (reply + react) ── */}
                              <div className="chat-message-actions-trigger">
                                {/* Reply button — Hello Hub style */}
                                <button
                                  type="button"
                                  className="chat-bubble-action-btn chat-reply-action-btn"
                                  title="Reply"
                                  onClick={() => setReplyingTo({
                                    messageId: entry._id || null,
                                    sender: entry.sender,
                                    senderName: isOwn ? "You" : (activeSelectedUser.name || activeSelectedUser.email),
                                    text: entry.text || (entry.mediaUrl ? "📎 Media" : ""),
                                    mediaUrl: entry.mediaUrl || null,
                                    mediaType: entry.mediaType || null,
                                  })}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                                </button>
                                {/* React button */}
                                <button
                                  type="button"
                                  className="chat-bubble-action-btn chat-react-action-btn"
                                  title="React"
                                  onClick={(e) => { e.stopPropagation(); setReactionPickerFor(reactionPickerFor === key ? null : key); }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                                </button>
                                {/* Reaction picker popover */}
                                {reactionPickerFor === key && (
                                  <div className="chat-reaction-wrap">
                                    <ReactionPicker
                                      onSelect={(emoji) => handleReaction(entry._id || key, emoji)}
                                      onClose={() => setReactionPickerFor(null)}
                                      isOwn={isOwn}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* ── Hello Hub-style quoted reply preview ── */}
                              {entry.replyTo?.text || entry.replyTo?.mediaUrl ? (
                                <div className={`chat-reply-quote ${isOwn ? "own" : "other"}`}>
                                  <div className="chat-reply-quote-bar" />
                                  <div className="chat-reply-quote-body">
                                    <span className="chat-reply-quote-name">{entry.replyTo.senderName || "User"}</span>
                                    <p className="chat-reply-quote-text">
                                      {entry.replyTo.mediaUrl
                                        ? <><span className="chat-reply-quote-media-icon">📎</span> {entry.replyTo.text || "Media"}</>
                                        : entry.replyTo.text}
                                    </p>
                                  </div>
                                </div>
                              ) : null}

                              <div className="chat-bubble-content">
                                {entry.text && <p>{entry.text}</p>}
                                {entry.mediaUrl && <MediaMessage mediaUrl={entry.mediaUrl} mediaType={entry.mediaType} />}
                                <div className="chat-bubble-meta">
                                  <time>{formatMsgTime(entry.time)}</time>
                                  {isOwn && (
                                    <span className={`chat-status-icon ${lastOwnMsgIsRead && index === conversationMessages.length - 1 ? "read" : ""}`}>
                                      {isPending ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" strokeOpacity="0.4"/></svg>
                                      ) : lastOwnMsgIsRead && index === conversationMessages.length - 1 ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/><polyline points="24 6 13 17" opacity="0.6"/></svg>
                                      ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* ── Reaction pills — show emoji + count ── */}
                              {reactionEntries.length > 0 && (
                                <div className="chat-bubble-reactions-list">
                                  {reactionEntries.map(([emoji, reactors]) => {
                                    const count = Array.isArray(reactors) ? reactors.length : (typeof reactors === "number" ? reactors : 0);
                                    const iReacted = Array.isArray(reactors) && reactors.includes(user?.email);
                                    return count > 0 ? (
                                      <button
                                        key={emoji}
                                        type="button"
                                        className={`chat-reaction-pill ${iReacted ? "i-reacted" : ""}`}
                                        onClick={() => handleReaction(entry._id, emoji)}
                                        title={iReacted ? "Remove reaction" : "React"}
                                      >
                                        {emoji}{count > 1 && <span className="chat-reaction-count">{count}</span>}
                                      </button>
                                    ) : null;
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {isTyping && (
                        <div className="chat-bubble-row received">
                          <div className="chat-bubble chat-typing-bubble">
                            <div className="chat-typing-indicator">
                              <span /><span /><span />
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={bottomRef} />
                    </div>
                  </div>

                  {/* ── Composer ── */}
                  <div className="chat-input-area">
                    {/* Hello Hub-style reply banner above input */}
                    <ReplyBanner replyingTo={replyingTo} onCancel={() => setReplyingTo(null)} />
                    {composerNotice.text && (
                      <div className={`chat-composer-notice ${composerNotice.type}`}>{composerNotice.text}</div>
                    )}
                    {/* Emoji picker — rendered ABOVE the wrap so it's never clipped */}
                    {showEmojiPicker && (
                      <div className="emoji-picker-container" ref={emojiPickerRef}>
                        <EmojiPicker onSelect={handleEmojiSelect} />
                      </div>
                    )}
                    <div className="chat-input-wrap">
                      {/* Emoji picker button */}
                      <button type="button" className="chat-input-icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Emoji">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={showEmojiPicker ? "#00a884" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                      </button>

                      {/* Attachment button */}
                      <button type="button" className="chat-input-icon-btn" onClick={() => mediaInputRef.current?.click()} title="Attach file">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      </button>
                      <input ref={mediaInputRef} type="file" style={{ display: "none" }} onChange={handleMediaFileChange} />

                      <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={handleTyping}
                        onKeyDown={handleMessageKeyDown}
                        placeholder="Type a message"
                        rows="1"
                      />

                      {message.trim() ? (
                        /* Send button — solid filled circle with arrow */
                        <button type="button" className="chat-send-btn" onClick={sendMessage} title="Send">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z"/></svg>
                        </button>
                      ) : isRecording ? (
                        /* Recording state — animated red mic with timer */
                        <button type="button" className="chat-voice-btn recording" onMouseUp={stopRecording} title="Release to send">
                          <span className="chat-recording-timer">{String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}</span>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                      ) : (
                        /* Voice mic button — hold to record */
                        <button type="button" className="chat-voice-btn" onMouseDown={startRecording} onTouchStart={startRecording} onMouseUp={stopRecording} onTouchEnd={stopRecording} title="Hold to record voice message">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="chat-panel-empty">
                  <div className="chat-panel-empty-content">
                    <div className="chat-empty-icon">
                      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.15 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <h2>No conversations yet</h2>
                    <p>Your latest conversation will open here automatically as soon as messages are available.</p>
                  </div>
                </div>
              )}
            </main>
          </>
        ) : activeTab === "status" ? (
          <StatusPage
            user={user}
            users={users}
            statusText={statusText}
            setStatusText={setStatusText}
            statusFile={statusFile}
            setStatusFile={setStatusFile}
            isEditingStatus={isEditingStatus}
            setIsEditingStatus={setIsEditingStatus}
            statusUploading={statusUploading}
            handleStatusUpdate={handleStatusUpdate}
            viewingStatusUser={viewingStatusUser}
            setViewingStatusUser={setViewingStatusUser}
            SERVER_URL={SERVER_URL}
            onStatusLike={handleStatusLike}
            onStatusView={handleStatusView}
          />

        ) : activeTab === "calls" ? (
          <CallsPanel contacts={callContacts} callHistory={callRecords} onStartCall={handleStartCall} />
        ) : (
          <SettingsPanel
            user={user}
            draft={settingsDraft}
            onDraftChange={handleDraftChange}
            onSave={handleSaveSettings}
            onOpenProfile={() => handleOpenProfileModal(user, true)}
            onLogout={handleLogout}
            saving={settingsSaving}
            theme={theme}
            toggleTheme={toggleTheme}
            stats={settingsStats}
            onBack={() => setActiveTab("chats")}
          />
        )}
      </section>



      {/* ── Status Overlays (Relocated to root for absolute full-screen coverage) ── */}
      {isEditingStatus && statusFile && (
        <div className="status-share-overlay" onClick={(e) => e.target === e.currentTarget && setIsEditingStatus(false)}>
          <div className="status-share-modal">
            <div className="status-share-header">
              <button type="button" className="status-share-close" onClick={() => { setIsEditingStatus(false); setStatusFile(null); }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <h3>Share Status</h3>
            </div>
            <div className="status-share-preview">
              {statusFile.type.startsWith("video/")
                ? <video src={URL.createObjectURL(statusFile)} controls className="status-share-media" />
                : <img src={URL.createObjectURL(statusFile)} alt="Preview" className="status-share-media" />
              }
            </div>
            <div className="status-share-caption-row">
              <input
                type="text"
                placeholder="Add a caption…"
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                className="status-share-caption-input"
                maxLength={200}
              />
            </div>
            <div className="status-share-footer">
              <button
                type="button"
                className="status-share-submit-btn"
                onClick={() => handleStatusUpdate()}
                disabled={statusUploading}
              >
                {statusUploading
                  ? <><span className="status-share-spinner" /> Sharing…</>
                  : <><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z"/></svg> Share Now</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {viewingStatusUser && (
          <StatusViewer 
            user={user}
            users={users}
            activeUser={viewingStatusUser}
            onClose={() => setViewingStatusUser(null)}
            resolveAssetUrl={resolveAssetUrl}
            onLike={handleStatusLike}
            onView={handleStatusView}
          />
        )}
      </AnimatePresence>

      <BottomNav
        activeTab={activeTab}
        onChange={setActiveTab}
        unreadCount={settingsStats.unreadCount}
        statusCount={settingsStats.statusCount}
        callCount={callRecords.length}
      />
      
      <IncomingCallModal 
        call={incomingCall} 
        onAccept={handleAcceptCall} 
        onDecline={handleDeclineCall} 
      />
      
      <ActiveCallOverlay 
        call={activeCallView} 
        localStream={callStreamRef.current}
        remoteStream={remoteStream}
        onEnd={handleEndCall}
        toggleMute={toggleMuteCall}
        toggleVideo={toggleVideoCall}
        isMuted={isCallMuted}
        isVideoOff={isCallVideoOff}
      />
    </div>

  );
}

export default Chat;
