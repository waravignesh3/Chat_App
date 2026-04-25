import { useEffect, useState } from "react";
import { getRedirectResult, signInWithRedirect } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import { auth, provider } from "../firebase";
import "../App.css";
import "../App.enhanced.css";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");

const parseResponse = async (response) => {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const syncGoogleUser = async (firebaseUser) => {
  const response = await fetch(`${SERVER_URL}/api/google-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
      email: firebaseUser.email,
      photo: firebaseUser.photoURL,
    }),
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(data.error || "Google login failed");
  }

  return data;
};

function Login({ user = null, setUser = () => {} }) {
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

  useEffect(() => {
    const completeRedirectLogin = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result?.user) return;

        setIsSubmitting(true);
        const data = await syncGoogleUser(result.user);

        setUser(data.user);
        setIsSuccess(true);
        showToast("success", "Welcome back", "Google login successful");
        setTimeout(() => navigate("/chat"), 900);
      } catch (error) {
        if (error?.code === "auth/no-auth-event") return;
        showToast("error", "Google login failed", error?.message || "Unable to continue");
      } finally {
        setIsSubmitting(false);
      }
    };

    completeRedirectLogin();
  }, [navigate, setUser]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

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
      await signInWithRedirect(auth, provider);
      return;
    } catch (error) {
      const message =
        error?.code === "auth/unauthorized-domain"
          ? "Authorize your frontend domain in Firebase Authentication settings."
          : error?.message || "Unable to continue";

      showToast("error", "Google login failed", message);
    } finally {
      if (!document.hidden) {
        setIsSubmitting(false);
      }
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
