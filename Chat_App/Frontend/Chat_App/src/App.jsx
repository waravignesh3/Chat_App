import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Login from "./components/login";
import Signup from "./components/signup";
import Chat from "./components/chat";

function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("chatapp-user");
    return savedUser ? JSON.parse(savedUser) : null;
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
        <Route path="/" element={<Login user={user} setUser={setUser} />} />
        <Route path="/login" element={<Login user={user} setUser={setUser} />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/chat"
          element={user ? <Chat user={user} /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
