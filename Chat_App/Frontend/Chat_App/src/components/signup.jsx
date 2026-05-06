import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parseJsonResponse } from "../utils/http";
import { useToast } from "./ToastContext";
import "../App.css";
import "../App.enhanced.css";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");

function Signup() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors]             = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();
  const navigate       = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateForm = () => {
    const errs = {};
    if (!formData.firstName.trim()) errs.firstName = "First name is required";
    if (!formData.lastName.trim())  errs.lastName  = "Last name is required";
    if (!formData.email.trim()) {
      errs.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errs.email = "Invalid email address";
    }
    if (!formData.password) {
      errs.password = "Password is required";
    } else if (formData.password.length < 6) {
      errs.password = "Minimum 6 characters required";
    }
    if (!formData.confirmPassword) {
      errs.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showToast("Please complete the form correctly", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${SERVER_URL}/api/register`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName:  formData.lastName,
          email:     formData.email,
          password:  formData.password,
        }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) { showToast(data.error || "Registration failed", "error"); return; }
      showToast("Account created! Taking you to login…", "success");
      setTimeout(() => navigate("/login"), 1500);
    } catch (error) {
      showToast(error.message || "Network error", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-backdrop auth-backdrop-left" aria-hidden="true" />
      <div className="auth-backdrop auth-backdrop-right" aria-hidden="true" />

      <section className="auth-layout auth-layout-signup">

        {/* ── Branding / Intro Panel ── */}
        <div className="auth-panel auth-intro" aria-hidden="true">
          <div>
            <div className="auth-brand">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.18-1.58A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.22-3.48-8.52z"
                  fill="#25D366"
                />
                <path
                  d="M17.47 14.38c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15s-.78.97-.96 1.17c-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.79-1.68-2.09-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.64-.93-2.25-.25-.6-.5-.52-.68-.53h-.58c-.2 0-.52.07-.8.37C7.4 7.9 6.6 8.67 6.6 10.2c0 1.53 1.12 3.01 1.27 3.22.15.2 2.2 3.37 5.34 4.73.75.32 1.33.51 1.78.65.75.24 1.43.2 1.96.12.6-.09 1.84-.75 2.1-1.48.26-.72.26-1.34.18-1.47-.07-.13-.27-.2-.57-.35z"
                  fill="#fff"
                />
              </svg>
              <span>Hello Hub</span>
            </div>

            <h1>Create your account.</h1>
            <p>Join the community and start chatting with anyone, instantly.</p>
          </div>

          {/* Feature highlights */}
          <div className="auth-metrics">
            <div className="metric-card">
              <strong>⚡ Instant</strong>
              <span>Real-time messaging powered by WebSockets</span>
            </div>
            <div className="metric-card">
              <strong>🔒 Secure</strong>
              <span>End-to-end encrypted transport layer</span>
            </div>
            <div className="metric-card">
              <strong>📸 Rich media</strong>
              <span>Share photos, videos and voice notes</span>
            </div>
            <div className="metric-card">
              <strong>🌙 Dark mode</strong>
              <span>Fully themed for day and night use</span>
            </div>
          </div>
        </div>

        {/* ── Form Panel ── */}
        <div className="auth-panel auth-card">
          <div className="auth-card-header">
            <span className="auth-eyebrow">Sign up</span>
            <h2>Create account</h2>
            <p>Fill in your details to get started for free.</p>
          </div>

          <form id="signup-form" className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-grid-two">
              <label className="auth-field">
                <span>First name</span>
                <input
                  id="signup-firstname"
                  type="text"
                  name="firstName"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  autoComplete="given-name"
                  className={errors.firstName ? "error" : ""}
                  aria-describedby={errors.firstName ? "signup-firstname-error" : undefined}
                />
                {errors.firstName && (
                  <span id="signup-firstname-error" className="error-message" role="alert">
                    {errors.firstName}
                  </span>
                )}
              </label>

              <label className="auth-field">
                <span>Last name</span>
                <input
                  id="signup-lastname"
                  type="text"
                  name="lastName"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  autoComplete="family-name"
                  className={errors.lastName ? "error" : ""}
                  aria-describedby={errors.lastName ? "signup-lastname-error" : undefined}
                />
                {errors.lastName && (
                  <span id="signup-lastname-error" className="error-message" role="alert">
                    {errors.lastName}
                  </span>
                )}
              </label>
            </div>

            <label className="auth-field">
              <span>Email address</span>
              <input
                id="signup-email"
                type="email"
                name="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                disabled={isSubmitting}
                autoComplete="email"
                className={errors.email ? "error" : ""}
                aria-describedby={errors.email ? "signup-email-error" : undefined}
              />
              {errors.email && (
                <span id="signup-email-error" className="error-message" role="alert">
                  {errors.email}
                </span>
              )}
            </label>

            <div className="auth-grid-two">
              <label className="auth-field">
                <span>Password</span>
                <input
                  id="signup-password"
                  type="password"
                  name="password"
                  placeholder="Min. 6 characters"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  className={errors.password ? "error" : ""}
                  aria-describedby={errors.password ? "signup-password-error" : undefined}
                />
                {errors.password && (
                  <span id="signup-password-error" className="error-message" role="alert">
                    {errors.password}
                  </span>
                )}
              </label>

              <label className="auth-field">
                <span>Confirm password</span>
                <input
                  id="signup-confirm-password"
                  type="password"
                  name="confirmPassword"
                  placeholder="Repeat password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  className={errors.confirmPassword ? "error" : ""}
                  aria-describedby={errors.confirmPassword ? "signup-confirm-error" : undefined}
                />
                {errors.confirmPassword && (
                  <span id="signup-confirm-error" className="error-message" role="alert">
                    {errors.confirmPassword}
                  </span>
                )}
              </label>
            </div>

            <button
              id="signup-submit-btn"
              type="submit"
              className="auth-button auth-button-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating account…" : "Create Account"}
            </button>

            <p className="auth-switch-text">
              Already have an account?{" "}
              <Link to="/login">Sign in</Link>
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}

export default Signup;
