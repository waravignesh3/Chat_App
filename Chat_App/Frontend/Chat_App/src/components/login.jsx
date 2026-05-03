import { useState, useEffect } from "react";
import {
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from "firebase/auth";
import { Link } from "react-router-dom";
import { auth, provider } from "../firebase";
import { parseJsonResponse } from "../utils/http";
import { useToast } from "./ToastContext";
import "../App.css";
import "../App.enhanced.css";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");

function Login({ setUser = () => {} }) {
  const [formData, setFormData]   = useState({ email: "", password: "" });
  const [errors, setErrors]       = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { showToast } = useToast();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateForm = () => {
    const nextErrors = {};
    if (!formData.email.trim()) {
      nextErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      nextErrors.email = "Enter a valid email";
    }
    if (!formData.password) nextErrors.password = "Password is required";
    return nextErrors;
  };

  /* ── Google Login ──────────────────────────────────────────────── */
  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);
      setIsSuccess(false);

      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        await setPersistence(auth, inMemoryPersistence);
      }

      const result = await signInWithPopup(auth, provider);

      const response = await fetch(`${SERVER_URL}/api/google-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:  result.user.displayName || result.user.email?.split("@")[0] || "User",
          email: result.user.email,
          photo: result.user.photoURL,
        }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) throw new Error(data.error || "Google login failed");

      setUser(data.user);
      setIsSuccess(true);
      showToast("Welcome! Signed in! Taking you to chat…", "success");
      // App.jsx route guard re-renders automatically when user state updates
    } catch (error) {
      if (
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/cancelled-popup-request"
      ) {
        return;
      }

      const message =
        error?.code === "auth/unauthorized-domain"
          ? "Add your frontend domain in Firebase → Authentication → Authorized Domains."
          : error?.message || "Unable to continue with Google";

      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Email / Password Login ────────────────────────────────────── */
  const handleManualLogin = async (event) => {
    event.preventDefault();

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showToast("Please complete all required fields", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      setIsSuccess(false);

      const response = await fetch(`${SERVER_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        showToast(data.error || "Unable to sign in", "error");
        return;
      }

      setUser(data.user);
      setIsSuccess(true);
      showToast(
        `Hi ${data.user?.name?.split(" ")[0] || "there"}, Login successful!`,
        "success"
      );
      // App.jsx route guard re-renders automatically when user state updates
    } catch (error) {
      showToast(error.message || "Unable to login", "error");
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
          <p>Log in to continue chatting with your friends, teams, and private groups.</p>

          <div className="auth-metrics">
            <div className="metric-card">
              <strong>Quick access</strong>
              <span>Pick up direct messages, groups, and shared moments instantly.</span>
            </div>
            <div className="metric-card">
              <strong>Secure sign-in</strong>
              <span>Use your account credentials or jump in with Google.</span>
            </div>
          </div>
        </div>

        <div className="auth-panel auth-card">
          <div className="auth-card-header">
            <span className="auth-eyebrow">Login</span>
            <h2>Sign in</h2>
            <p>Enter your email and password to continue.</p>
          </div>

          <form className="auth-form" onSubmit={handleManualLogin}>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                disabled={isSubmitting}
                className={errors.email ? "error" : ""}
              />
              {errors.email && <span className="error-message">{errors.email}</span>}
            </label>

            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                disabled={isSubmitting}
                className={errors.password ? "error" : ""}
              />
              {errors.password && <span className="error-message">{errors.password}</span>}
            </label>

            <button
              type="submit"
              className="auth-button auth-button-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in…" : isSuccess ? "Success! Redirecting…" : "Login"}
            </button>

            <div className="auth-divider"><span>or continue with</span></div>

            <button
              type="button"
              className="auth-button auth-button-secondary"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
            >
              <span className="google-mark" aria-hidden="true">G</span>
              Google
            </button>
          </form>

          <p className="auth-switch-text">
            Don&apos;t have an account? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

export default Login;