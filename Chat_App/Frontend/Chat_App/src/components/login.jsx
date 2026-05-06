import { useState } from "react";
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
  const [formData, setFormData]         = useState({ email: "", password: "" });
  const [errors, setErrors]             = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess]       = useState(false);
  const { showToast } = useToast();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateForm = () => {
    const errs = {};
    if (!formData.email.trim()) {
      errs.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errs.email = "Enter a valid email";
    }
    if (!formData.password) errs.password = "Password is required";
    return errs;
  };

  /* ── Google Login ─────────────────────────────────── */
  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);
      setIsSuccess(false);
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        await setPersistence(auth, inMemoryPersistence);
      }
      const result   = await signInWithPopup(auth, provider);
      const response = await fetch(`${SERVER_URL}/api/google-login`, {
        method:  "POST",
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
      showToast(`Welcome back! Taking you to chat…`, "success");
    } catch (error) {
      if (
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/cancelled-popup-request"
      ) return;
      const message =
        error?.code === "auth/unauthorized-domain"
          ? "Add your frontend domain in Firebase → Authentication → Authorized Domains."
          : error?.message || "Unable to continue with Google";
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Email / Password Login ───────────────────────── */
  const handleManualLogin = async (e) => {
    e.preventDefault();
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
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) { showToast(data.error || "Unable to sign in", "error"); return; }
      setUser(data.user);
      setIsSuccess(true);
      showToast(`Hi ${data.user?.name?.split(" ")[0] || "there"}, welcome back!`, "success");
    } catch (error) {
      showToast(error.message || "Unable to login", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-backdrop auth-backdrop-left" aria-hidden="true" />
      <div className="auth-backdrop auth-backdrop-right" aria-hidden="true" />

      <section className="auth-layout auth-layout-login">

        {/* ── Branding / Intro Panel ── */}
        <div className="auth-panel auth-intro" aria-hidden="true">
          <div>
            <div className="auth-brand">
              {/* Hello Hub-style speech bubble logo */}
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.18-1.58A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.22-3.48-8.52z"
                  fill="#6366F1"
                />
                <path
                  d="M17.47 14.38c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15s-.78.97-.96 1.17c-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.79-1.68-2.09-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.64-.93-2.25-.25-.6-.5-.52-.68-.53h-.58c-.2 0-.52.07-.8.37C7.4 7.9 6.6 8.67 6.6 10.2c0 1.53 1.12 3.01 1.27 3.22.15.2 2.2 3.37 5.34 4.73.75.32 1.33.51 1.78.65.75.24 1.43.2 1.96.12.6-.09 1.84-.75 2.1-1.48.26-.72.26-1.34.18-1.47-.07-.13-.27-.2-.57-.35z"
                  fill="#fff"
                />
              </svg>
              <span>Hello Hub</span>
            </div>

            <h1>Connect with your world.</h1>
            <p>Sign in to start chatting with friends and family in real-time — securely and instantly.</p>
          </div>

          {/* Chat preview */}
          <div className="auth-chat-preview">
            <div className="auth-chat-preview-header">
              <span className="auth-chat-dot online" aria-hidden="true" />
              <strong>Live conversation</strong>
            </div>
            <div className="auth-chat-bubble other">
              Hey! Did you try the new app yet? It's super fast 🚀
            </div>
            <div className="auth-chat-bubble own">
              Just signed in. This feels exactly like Hello Hub 😍
            </div>
            <div className="auth-chat-preview-footer">
              <span>Real-time messaging</span>
              <span>End-to-end secure</span>
            </div>
          </div>
        </div>

        {/* ── Form Panel ── */}
        <div className="auth-panel auth-card">
          <div className="auth-card-header">
            <span className="auth-eyebrow">Login</span>
            <h2>Sign in</h2>
            <p>Enter your credentials to continue.</p>
          </div>

          <form id="login-form" className="auth-form" onSubmit={handleManualLogin} noValidate>
            <label className="auth-field">
              <span>Email address</span>
              <input
                id="login-email"
                type="email"
                name="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                disabled={isSubmitting}
                autoComplete="email"
                className={errors.email ? "error" : ""}
                aria-describedby={errors.email ? "login-email-error" : undefined}
              />
              {errors.email && (
                <span id="login-email-error" className="error-message" role="alert">
                  {errors.email}
                </span>
              )}
            </label>

            <label className="auth-field">
              <span>Password</span>
              <input
                id="login-password"
                type="password"
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                disabled={isSubmitting}
                autoComplete="current-password"
                className={errors.password ? "error" : ""}
                aria-describedby={errors.password ? "login-password-error" : undefined}
              />
              {errors.password && (
                <span id="login-password-error" className="error-message" role="alert">
                  {errors.password}
                </span>
              )}
            </label>

            <button
              id="login-submit-btn"
              type="submit"
              className="auth-button auth-button-primary"
              disabled={isSubmitting}
            >
              {isSubmitting && !isSuccess
                ? "Signing in…"
                : isSuccess
                ? "✓ Success! Redirecting…"
                : "Login"}
            </button>

            <div className="auth-divider"><span>or continue with</span></div>

            <button
              id="login-google-btn"
              type="button"
              className="auth-button auth-button-secondary"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
            >
              <span className="google-mark" aria-hidden="true">G</span>
              Continue with Google
            </button>
          </form>

          <p className="auth-switch-text">
            Don&apos;t have an account?{" "}
            <Link to="/signup">Create one free</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

export default Login;
