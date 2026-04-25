import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { parseJsonResponse } from "../utils/http";
import "../App.css";
import "../App.enhanced.css";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");
const socket = io(SERVER_URL, {
  transports: ["websocket"],
  withCredentials: true,
});

function Chat({ user, setUser }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState("");
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingIndicatorTimeoutRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.email) {
      socket.emit("register", user.email);
    }
  }, [user]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setIsLoadingUsers(true);
        setUsersError("");

        const response = await fetch(`${SERVER_URL}/api/users`);
        const data = await parseJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Unable to load users");
        }

        setUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Users fetch error:", error);
        setUsers([]);
        setUsersError(error.message || "Unable to load users");
      } finally {
        setIsLoadingUsers(false);
      }
    };

    loadUsers();
  }, []);

  useEffect(() => {
    const handleUsersUpdate = (data) => setUsers(Array.isArray(data) ? data : []);
    socket.on("users_update", handleUsersUpdate);

    return () => socket.off("users_update", handleUsersUpdate);
  }, []);

  useEffect(() => {
    const handlePrivateMessage = (incomingMessage) => {
      setMessages((prev) => [...prev, incomingMessage]);
      setIsTyping(false);
    };

    socket.on("private_message", handlePrivateMessage);

    return () => socket.off("private_message", handlePrivateMessage);
  }, []);

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

    socket.on("typing", handleTypingStart);
    socket.on("stop_typing", handleTypingStop);

    return () => {
      socket.off("typing", handleTypingStart);
      socket.off("stop_typing", handleTypingStop);
    };
  }, [selectedUser]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, selectedUser, isTyping]);

  useEffect(() => () => {
    clearTimeout(typingTimeoutRef.current);
    clearTimeout(typingIndicatorTimeoutRef.current);
  }, []);

  const handleLogout = () => {
    setUser(null);
    navigate("/login", { replace: true });
  };

  const activeSelectedUser = useMemo(
    () =>
      selectedUser?.email
        ? users.find((entry) => entry.email === selectedUser.email) || selectedUser
        : null,
    [selectedUser, users]
  );

  const sendMessage = () => {
    if (!message.trim() || !activeSelectedUser || !user?.email) return;

    const msgData = {
      text: message.trim(),
      sender: user.email,
      receiver: activeSelectedUser.email,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    socket.emit("private_message", {
      to: activeSelectedUser.email,
      message: msgData,
    });
    socket.emit("stop_typing", { to: activeSelectedUser.email, from: user.email });

    setMessages((prev) => [...prev, msgData]);
    setMessage("");
    setIsTyping(false);
  };

  const filteredUsers = useMemo(
    () =>
      users.filter((entry) => {
        if (!entry?.email || entry.email === user?.email) return false;

        const query = search.toLowerCase();
        return (
          entry.email.toLowerCase().includes(query) ||
          entry.name?.toLowerCase().includes(query)
        );
      }),
    [search, user?.email, users]
  );

  const conversationMessages = useMemo(
    () =>
      messages.filter(
        (entry) =>
          activeSelectedUser &&
          ((entry.sender === user?.email && entry.receiver === activeSelectedUser.email) ||
            (entry.sender === activeSelectedUser.email && entry.receiver === user?.email))
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
      socket.emit("typing", { to: activeSelectedUser.email, from: user.email });
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("stop_typing", { to: activeSelectedUser.email, from: user.email });
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
            <h2>Chats</h2>
            <p>{user?.name || user?.email}</p>
          </div>

          <label className="chat-search">
            <span className="sr-only">Search user</span>
            <input
              type="text"
              placeholder="Search by name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="chat-user-list">
            {isLoadingUsers ? (
              <div className="chat-empty-state">
                <strong>Loading users...</strong>
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
                      <img
                        src={entry.photo || "https://via.placeholder.com/48"}
                        alt={entry.name || entry.email}
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
                {activeSelectedUser ? activeSelectedUser.name || activeSelectedUser.email : "Select a user"}
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
                    const isOwnMessage = entry.sender === user?.email;

                    return (
                      <article
                        key={`${entry.sender}-${entry.receiver}-${entry.time}-${index}`}
                        className={`chat-bubble${isOwnMessage ? " own" : ""}`}
                      >
                        <span className="chat-bubble-sender">
                          {isOwnMessage ? "You" : activeSelectedUser.name || activeSelectedUser.email}
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
