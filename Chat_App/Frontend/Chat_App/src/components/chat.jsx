import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { parseJsonResponse } from "../utils/http";
import "../App.css";
import "../App.enhanced.css";
import "../chat.profile.css";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");

// Palette of background colours — picked by a simple hash of the name/email
// so the same person always gets the same colour.
const AVATAR_COLORS = [
  "#4f46e5", "#0891b2", "#059669", "#d97706",
  "#dc2626", "#7c3aed", "#db2777", "#0284c7",
];

function hashColor(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * Shows the user's photo if available, otherwise renders a coloured circle
 * with the first letter of their name (or email) — no external requests.
 */
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
          // Photo URL broken — swap to initials div
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


function Chat({ user, setUser }) {
  const [message, setMessage]         = useState("");
  const [messages, setMessages]       = useState([]);
  const [users, setUsers]             = useState([]);
  const [search, setSearch]           = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isTyping, setIsTyping]       = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError]   = useState("");

  const bottomRef                     = useRef(null);
  const typingTimeoutRef              = useRef(null);
  const typingIndicatorTimeoutRef     = useRef(null);
  const navigate                      = useNavigate();

  // Socket lives in a ref so it is created once and never recreated on
  // StrictMode double-mount, preventing duplicate event listeners.
  const socketRef = useRef(null);

  // FIX: Create socket AND register in a single effect so there is no
  // race condition between socket creation and the register emit.
  useEffect(() => {
    if (socketRef.current) return; // already created

    const socket = io(SERVER_URL, {
      transports:      ["websocket"],
      withCredentials: true,
    });

    socketRef.current = socket;

    // Register online presence as soon as connection is confirmed
    socket.on("connect", () => {
      if (user?.email) {
        socket.emit("register", user.email);
      }
    });

    return () => {
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(typingIndicatorTimeoutRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-register if user email changes after socket is already open
  useEffect(() => {
    if (user?.email && socketRef.current?.connected) {
      socketRef.current.emit("register", user.email);
    }
  }, [user?.email]);

  // Initial user list fetch — retries on 503 to handle backend cold starts
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
          // Retry up to 3 times on 503 (DB cold start on Render free tier)
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

  // Real-time user list updates
  useEffect(() => {
    const handler = (data) => setUsers(Array.isArray(data) ? data : []);
    socketRef.current?.on("users_update", handler);
    return () => socketRef.current?.off("users_update", handler);
  }, []);

  // Incoming private messages
  useEffect(() => {
    const handler = (incomingMessage) => {
      setMessages((prev) => [...prev, incomingMessage]);
      setIsTyping(false);
    };
    socketRef.current?.on("private_message", handler);
    return () => socketRef.current?.off("private_message", handler);
  }, []);

  // Typing indicators
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

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, selectedUser, isTyping]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Logout error:", error);
    } finally {
      setSelectedUser(null);
      setMessage("");
      setMessages([]);
      setUser(null);
      navigate("/login", { replace: true });
    }
  };

  // Always reflect latest online status from the live users list
  const activeSelectedUser = useMemo(
    () =>
      selectedUser?.email
        ? users.find((u) => u.email === selectedUser.email) || selectedUser
        : null,
    [selectedUser, users]
  );

  const sendMessage = () => {
    if (!message.trim() || !activeSelectedUser || !user?.email) return;

    const msgData = {
      text:     message.trim(),
      sender:   user.email,
      receiver: activeSelectedUser.email,
      time:     new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    socketRef.current?.emit("private_message", { to: activeSelectedUser.email, message: msgData });
    socketRef.current?.emit("stop_typing",     { to: activeSelectedUser.email, from: user.email });

    setMessages((prev) => [...prev, msgData]);
    setMessage("");
    setIsTyping(false);
  };

  const filteredUsers = useMemo(
    () =>
      users.filter((u) => {
        if (!u?.email || u.email === user?.email) return false;
        const q = search.toLowerCase();
        return u.email.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
      }),
    [search, user?.email, users]
  );

  const conversationMessages = useMemo(
    () =>
      messages.filter(
        (m) =>
          activeSelectedUser &&
          ((m.sender === user?.email && m.receiver === activeSelectedUser.email) ||
            (m.sender === activeSelectedUser.email && m.receiver === user?.email))
      ),
    [activeSelectedUser, messages, user?.email]
  );

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

  return (
    <div className="chat-shell">
      <div className="chat-ambient chat-ambient-left" />
      <div className="chat-ambient chat-ambient-right" />

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
              <div className="chat-self-avatar-wrap">
                <Avatar
                  name={user?.name}
                  email={user?.email}
                  photo={user?.photo}
                  size={44}
                  className="chat-self-avatar"
                />
                <span className="chat-online-ring" />
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
                return (
                  <button
                    key={entry.email}
                    type="button"
                    className={`chat-user-card${isActive ? " chat-user-card-active" : ""}`}
                    onClick={() => setSelectedUser(entry)}
                  >
                    <div className="chat-avatar-wrap">
                      <Avatar
                        name={entry.name}
                        email={entry.email}
                        photo={entry.photo}
                        size={44}
                        className="chat-avatar"
                      />
                      {entry.isOnline && <span className="chat-online-ring" />}
                    </div>
                    <span className="chat-user-copy">
                      <strong>{entry.name || entry.email}</strong>
                      <span>{entry.email}</span>
                      <span className={entry.isOnline ? "chat-status online" : "chat-status"}>
                        {entry.isOnline ? "Online" : `Last seen: ${entry.lastSeen || "Offline"}`}
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
              <h3>
                {activeSelectedUser
                  ? activeSelectedUser.name || activeSelectedUser.email
                  : "Select a user"}
              </h3>
              <p>
                {activeSelectedUser
                  ? activeSelectedUser.isOnline
                    ? "Available now"
                    : activeSelectedUser.lastSeen || "Offline"
                  : "Choose someone from the list to start chatting."}
              </p>
            </div>
          </div>

          <div className="chat-messages">
            {activeSelectedUser ? (
              conversationMessages.length > 0 ? (
                <>
                  {conversationMessages.map((entry, index) => {
                    const isOwn = entry.sender === user?.email;
                    return (
                      <article
                        key={`${entry.sender}-${entry.receiver}-${entry.time}-${index}`}
                        className={`chat-bubble${isOwn ? " own" : ""}`}
                      >
                        <span className="chat-bubble-sender">
                          {isOwn ? "You" : activeSelectedUser.name || activeSelectedUser.email}
                        </span>
                        <p>{entry.text}</p>
                        <time>{entry.time}</time>
                      </article>
                    );
                  })}
                  {isTyping && (
                    <div className="chat-typing-indicator">
                      <span /><span /><span />
                    </div>
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

          <div className="chat-compose">
            <textarea
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