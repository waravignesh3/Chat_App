import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "../firebase";
function Login({ user, setUser }) {
    const [showPopup, setShowPopup] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const handleGoogleLogin = async () => {
        const result = await signInWithPopup(auth, provider);
        setUser(result.user);
        await fetch("http://localhost:5000/google-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: result.user.displayName,
                email: result.user.email,
                photo: result.user.photoURL
            })
        });
        showSuccess();
    };
    const handleManualLogin = async () => {
        const res = await fetch("http://localhost:5000/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.user) {
            setUser(data.user);
            showSuccess();
        } else {
            alert(data.message || "Login failed");
        }
    };
    const showSuccess = () => {
        setShowPopup(true);
        setTimeout(() => setShowPopup(false), 2000);
    };
    return (
        <div>
            <h2>Login</h2>
            <input
                type="email"
                placeholder="Email"
                onChange={(e) => setEmail(e.target.value)}
            />
            <input
                type="password"
                placeholder="Password"
                onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={handleManualLogin}>Login</button>
            <a href="/signup">Don't have an account? Sign up</a>
            <hr />
            <button onClick={handleGoogleLogin}>
                Login with Google
            </button>
            {showPopup && user && (
                <div>
                    <h2>Welcome {user.displayName || user.email}</h2>
                    {user.photoURL && (
                        <img src={user.photoURL} alt="Profile" width="100" />
                    )}
                    ✅ Login Successful!
                </div>
            )}
        </div>
    );
}
export default Login;