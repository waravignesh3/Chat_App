import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import Login from "./components/login";
import Signup from "./components/signup";
import Chat from "./components/chat";
import { auth } from "./firebase";
import { requestJson } from "./utils/http";
import { ToastProvider } from "./components/ToastContext";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");

const buildFirebaseFallbackUser = (firebaseUser) => ({
  id: firebaseUser.uid,  // FIX: was _id — align with backend (MySQL uses `id`)
  name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
  email: firebaseUser.email,
  photo: firebaseUser.photoURL,
  provider: "google",
  isOnline: true,
  lastSeen: "Online",
});

const syncGoogleUser = (firebaseUser) =>
  requestJson(`${SERVER_URL}/api/google-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name:  firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
      email: firebaseUser.email,
      photo: firebaseUser.photoURL,
    }),
  });

function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("chatapp-user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.removeItem("chatapp-user");
      return null;
    }
  });

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("chatapp-theme") || "dark";
  });

  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem("chatapp-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // authReady blocks rendering until Firebase has resolved the initial
  // auth state — prevents a flash-redirect to /login on page refresh.
  const [authReady, setAuthReady] = useState(false);

  // Persist user to localStorage whenever it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem("chatapp-user", JSON.stringify(user));
    } else {
      localStorage.removeItem("chatapp-user");
    }
  }, [user]);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!active) return;

        if (!firebaseUser?.email) {
          // Signed out — clear any stale Google session from state
          // but DON'T clear local/email users (they manage their own state)
          setAuthReady(true);
          return;
        }

        // FIX: Always sync Google users on auth state change.
        // The previous "skip if email matches" guard prevented setUser from
        // being called after signInWithPopup, so the user state stayed null
        // and the /chat route guard bounced back to /login.
        // Only skip if we already have a fully-formed DB user (has numeric id).
        if (user?.id && user?.email === firebaseUser.email && user?.provider === "google") {
          setAuthReady(true);
          return;
        }

        const data = await syncGoogleUser(firebaseUser);
        if (!active) return;

        if (data?.user) {
          setUser(data.user);
        } else {
          // Backend unreachable — use Firebase data as fallback so the
          // user still lands in the chat rather than getting stuck.
          setUser(buildFirebaseFallbackUser(firebaseUser));
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error("Global auth sync failed:", error);
        // Fallback: let the user in with Firebase data
        if (active && auth.currentUser?.email) {
          setUser(buildFirebaseFallbackUser(auth.currentUser));
        }
      } finally {
        if (active) setAuthReady(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []); // Run once on mount — onAuthStateChanged handles all state transitions

  if (!authReady) {
    return <div className="auth-bootstrap">Loading your session…</div>;
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={user ? <Navigate to="/chat" replace /> : <Login setUser={setUser} />}
          />
          <Route
            path="/login"
            element={user ? <Navigate to="/chat" replace /> : <Login setUser={setUser} />}
          />
          <Route
            path="/signup"
            element={user ? <Navigate to="/chat" replace /> : <Signup />}
          />
          <Route
            path="/chat"
            element={user ? <Chat user={user} setUser={setUser} theme={theme} toggleTheme={toggleTheme} /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to={user ? "/chat" : "/login"} replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;