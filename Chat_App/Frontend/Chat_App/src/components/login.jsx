import { useEffect, useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import { auth, provider } from "../firebase";
import "../App.css";
import "../App.enhanced.css";

// ✅ FIX: Use dynamic hostname so LAN users connect to the right server
const SERVER_URL = `http://${window.location.hostname}:5000`;

function Login({ user = null, setUser = () => {} }) {
  // ✅ FIX: Login only needs email + password — removed firstName/lastName
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState({
    visible: false,
    variant: "success",
    title: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (!toast.visible) return undefined;

    const timer = window.setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [toast.visible]);

  const showToast = (variant, title, message) => {
    setToast({ visible: true, variant, title, message });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // ✅ FIX: Only validate email + password (no firstName/lastName needed for login)
  const validateForm = () => {
    const nextErrors = {};

    if (!formData.email.trim()) {
      nextErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      nextErrors.email = "Enter a valid email";
    }

    if (!formData.password) {
      nextErrors.password = "Password is required";
    }

    return nextErrors;
  };

  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);
      setIsSuccess(false);

      const result = await signInWithPopup(auth, provider);
      const response = await fetch(`${SERVER_URL}/google-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: result.user.displayName || result.user.email?.split("@")[0] || "User",
          email: result.user.email,
          photo: result.user.photoURL,
        }),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.error || "Google login failed");
      }

      setUser(data);
      setIsSuccess(true);
      showToast("success", "Welcome back", "Google login successful");
      setTimeout(() => navigate("/chat"), 1000);
    } catch (error) {
      showToast("error", "Google login failed", error.message || "Unable to continue");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualLogin = async (event) => {
    event.preventDefault();

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showToast("error", "Check your details", "Please complete all required fields");
      return;
    }

    try {
      setIsSubmitting(true);
      setIsSuccess(false);

      const response = await fetch(`${SERVER_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        showToast("error", "Login failed", data.error || "Unable to sign in");
        return;
      }

      setUser(data.user);
      setIsSuccess(true);
      showToast(
        "success",
        `Hi ${data.user?.name?.split(" ")[0] || "there"}`,
        "Login successful. Redirecting to chat..."
      );

      setTimeout(() => navigate("/chat"), 1000);
    } catch (error) {
      showToast("error", "Network error", error.message || "Unable to login");
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

          {/* ✅ FIX: Only email + password fields for login */}
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
              {isSubmitting ? "Signing in..." : isSuccess ? "Success! Redirecting..." : "Login"}
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
          </form>

          <p className="auth-switch-text">
            Don&apos;t have an account? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </section>

      <div
        className={`auth-toast auth-toast-${toast.variant}${toast.visible ? " auth-toast-visible" : ""}`}
      >
        <div className="toast-icon">{toast.variant === "success" ? "OK" : "!"}</div>
        <div>
          <strong>{toast.title || user?.name || user?.email || "Welcome"}</strong>
          <p>{toast.message || "Login successful"}</p>
        </div>
      </div>
    </div>
  );
}

export default Login;