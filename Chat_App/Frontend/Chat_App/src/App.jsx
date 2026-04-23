import Login from './components/login';
import { useState } from 'react';
import Chat from './components/chat';
import './App.css'

function App() {
  const [user, setUser] = useState(null);

  return (
    <>
      {!user ? (
        <Login setUser={setUser} />
      ) : (
        <Chat user={user} />
      )}
    </>
  );
}

export default App
