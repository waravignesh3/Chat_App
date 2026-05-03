import { useEffect, useState } from "react";
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
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  const navigate = useNavigate();

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) newErrors.firstName = "First name is required";
    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required";

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Invalid email";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Minimum 6 characters required";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    return newErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showToast("Please complete the form correctly", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${SERVER_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        showToast(data.error || "Registration failed", "error");
        return;
      }

      showToast("Account created! You can now sign in.", "success");
      setTimeout(() => navigate("/login"), 1500);
    } catch (error) {
      showToast(error.message || "Network error", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-backdrop auth-backdrop-left" />
      <div className="auth-backdrop auth-backdrop-right" />

      <section className="auth-layout auth-layout-signup">
        <div className="auth-panel auth-intro">
          <span className="auth-badge">ChatApp</span>
          <h1>Create your account</h1>
          <p>Join and start chatting instantly.</p>

          <div className="auth-metrics">
            <div className="metric-card">
              <strong>Fast onboarding</strong>
              <span>Create your profile with a clean, guided form.</span>
            </div>
            <div className="metric-card">
              <strong>Shared experience</strong>
              <span>Signup, login, and chat now feel part of one visual system.</span>
            </div>
          </div>
        </div>

        <div className="auth-panel auth-card">
          <div className="auth-card-header">
            <span className="auth-eyebrow">Signup</span>
            <h2>Create account</h2>
            <p>Fill the form to get started</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-grid-two">
              <label className="auth-field">
                <span>First Name</span>
                <input
                  type="text"
                  name="firstName"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={handleChange}
                  className={errors.firstName ? "error" : ""}
                />
                {errors.firstName && <span className="error-message">{errors.firstName}</span>}
              </label>

              <label className="auth-field">
                <span>Last Name</span>
                <input
                  type="text"
                  name="lastName"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={handleChange}
                  className={errors.lastName ? "error" : ""}
                />
                {errors.lastName && <span className="error-message">{errors.lastName}</span>}
              </label>
            </div>

            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                className={errors.email ? "error" : ""}
              />
              {errors.email && <span className="error-message">{errors.email}</span>}
            </label>

            <div className="auth-grid-two">
              <label className="auth-field">
                <span>Password</span>
                <input
                  type="password"
                  name="password"
                  placeholder="Minimum 6 characters"
                  value={formData.password}
                  onChange={handleChange}
                  className={errors.password ? "error" : ""}
                />
                {errors.password && <span className="error-message">{errors.password}</span>}
              </label>

              <label className="auth-field">
                <span>Confirm Password</span>
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Repeat password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={errors.confirmPassword ? "error" : ""}
                />
                {errors.confirmPassword && (
                  <span className="error-message">{errors.confirmPassword}</span>
                )}
              </label>
            </div>

            <button
              type="submit"
              className="auth-button auth-button-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Sign Up"}
            </button>

            <p className="auth-switch-text">
              Already have an account? <Link to="/login">Login</Link>
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}

export default Signup;
