import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import Login from "./components/login";
import Signup from "./components/signup";
import Chat from "./components/chat";
import { auth } from "./firebase";
import { requestJson } from "./utils/http";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");

const syncGoogleUser = async (firebaseUser) =>
  requestJson(`${SERVER_URL}/api/google-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
      email: firebaseUser.email,
      photo: firebaseUser.photoURL,
    }),
  });

function App() {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("chatapp-user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      localStorage.removeItem("chatapp-user");
      return null;
    }
  });
  const [authReady, setAuthReady] = useState(false);

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
          setAuthReady(true);
          return;
        }

        if (user?.email === firebaseUser.email) {
          setAuthReady(true);
          return;
        }

        const data = await syncGoogleUser(firebaseUser);
        if (!active) return;

        setUser(data.user);
      } catch (error) {
        console.error("Global auth sync failed:", error);
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user?.email]);

  if (!authReady) {
    return null;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to="/chat" replace /> : <Login user={user} setUser={setUser} />}
        />
        <Route
          path="/login"
          element={user ? <Navigate to="/chat" replace /> : <Login user={user} setUser={setUser} />}
        />
        <Route path="/signup" element={user ? <Navigate to="/chat" replace /> : <Signup />} />
        <Route
          path="/chat"
          element={user ? <Chat user={user} setUser={setUser} /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to={user ? "/chat" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
