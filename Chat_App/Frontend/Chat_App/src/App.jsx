import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Login from "./components/login";
import Signup from "./components/signup";
import Chat from "./components/chat";

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

  useEffect(() => {
    if (user) {
      localStorage.setItem("chatapp-user", JSON.stringify(user));
    } else {
      localStorage.removeItem("chatapp-user");
    }
  }, [user]);

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
