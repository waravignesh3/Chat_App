import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "../firebase";
import { Link } from "react-router-dom";
import "../App.css";

function Login({ user = null, setUser = () => {} }) {
  const [showPopup, setShowPopup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showSuccess = () => {
    setShowPopup(true);
    setTimeout(() => setShowPopup(false), 2200);
  };

  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      await fetch("http://localhost:5000/google-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: result.user.displayName,
          email: result.user.email,
          photo: result.user.photoURL,
        }),
      });
      showSuccess();
    } catch (error) {
      alert(error.message || "Google login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualLogin = async () => {
    try {
      setIsSubmitting(true);
      const res = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        showSuccess();
        return;
      }
      alert(data.message || "Login failed");
    } catch (error) {
      alert(error.message || "Unable to login right now");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-backdrop auth-backdrop-left" />
      <div className="auth-backdrop auth-backdrop-right" />

      <section className="auth-layout auth-layout-login">
        <div className="auth-panel auth-intro">
          <span className="auth-badge">ChatApp</span>
          <h1>Welcome back to your conversations.</h1>
          <p>
            Log in to pick up where your messages, groups, and shared moments left off.
          </p>

          <div className="auth-metrics">
            <div className="metric-card">
              <strong>Fast replies</strong>
              <span>Stay synced across personal chats and team spaces.</span>
            </div>
            <div className="metric-card">
              <strong>Secure access</strong>
              <span>Use your email login or continue instantly with Google.</span>
            </div>
          </div>
        </div>

        <div className="auth-panel auth-card">
          <div className="auth-card-header">
            <span className="auth-eyebrow">Login</span>
            <h2>Sign in</h2>
            <p>Access your account with the same look and feel as signup.</p>
          </div>

          <div className="auth-form">
            <label className="auth-field">
              <span>Email Address</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <button
              type="button"
              className="auth-button auth-button-primary"
              onClick={handleManualLogin}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in..." : "Login"}
            </button>

            <div className="auth-divider">
              <span>or continue with</span>
            </div>

            <button
              type="button"
              className="auth-button auth-button-secondary"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
            >
              <span className="google-mark" aria-hidden="true">G</span>
              Google
            </button>
          </div>

          <p className="auth-switch-text">
            Don&apos;t have an account? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </section>

      <div className={`auth-toast${showPopup && user ? " auth-toast-visible" : ""}`}>
        <div className="toast-icon">OK</div>
        <div>
          <strong>{user?.displayName || user?.email || "Welcome"}</strong>
          <p>Login successful.</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
