import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import "../App.css";
import "../App.enhanced.css";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");
const socket = io(SERVER_URL, {
  transports: ["websocket"],
  withCredentials: true,
});

function Chat({ user }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingIndicatorTimeoutRef = useRef(null);

  useEffect(() => {
    if (user?.email) {
      socket.emit("register", user.email);
    }
  }, [user]);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/users`)
      .then((response) => response.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((error) => console.error("Users fetch error:", error));
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

  const sendMessage = () => {
    if (!message.trim() || !selectedUser || !user?.email) return;

    const msgData = {
      text: message.trim(),
      sender: user.email,
      receiver: selectedUser.email,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    socket.emit("private_message", {
      to: selectedUser.email,
      message: msgData,
    });
    socket.emit("stop_typing", { to: selectedUser.email, from: user.email });

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
          selectedUser &&
          ((entry.sender === user?.email && entry.receiver === selectedUser.email) ||
            (entry.sender === selectedUser.email && entry.receiver === user?.email))
      ),
    [messages, selectedUser, user?.email]
  );

  const handleMessageKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleTyping = (event) => {
    setMessage(event.target.value);

    if (selectedUser) {
      clearTimeout(typingTimeoutRef.current);
      socket.emit("typing", { to: selectedUser.email, from: user.email });
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("stop_typing", { to: selectedUser.email, from: user.email });
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
            <span className="chat-chip">Inbox</span>
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
            {filteredUsers.length > 0 ? (
              filteredUsers.map((entry) => {
                const isActive = selectedUser?.email === entry.email;

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
                {selectedUser ? selectedUser.name || selectedUser.email : "Select a user"}
              </h3>
              <p>
                {selectedUser
                  ? selectedUser.isOnline
                    ? "Available now"
                    : selectedUser.lastSeen || "Offline"
                  : "Choose someone from the list to start chatting."}
              </p>
            </div>
          </div>

          <div className="chat-messages">
            {selectedUser ? (
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
                          {isOwnMessage ? "You" : selectedUser.name || selectedUser.email}
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
                selectedUser ? `Message ${selectedUser.name || selectedUser.email}` : "Pick a user to start typing"
              }
              disabled={!selectedUser}
              rows="1"
            />
            <button
              type="button"
              className="chat-send-button"
              onClick={sendMessage}
              disabled={!selectedUser || !message.trim()}
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
