import { useState } from "react";
import "../App.css";
import { Link } from "react-router-dom";

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

  const handleChange = (e) => {
    const { name, value } = e.target;
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
      newErrors.email = "Email is invalid";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validateForm();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      alert("Signup successful!");
      console.log("Form data:", formData);
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
      setIsSubmitting(false);
    }, 700);
  };

  return (
    <div className="auth-shell">
      <div className="auth-backdrop auth-backdrop-left" />
      <div className="auth-backdrop auth-backdrop-right" />

      <section className="auth-layout auth-layout-signup">
        <div className="auth-panel auth-intro">
          <span className="auth-badge">ChatApp</span>
          <h1>Create a profile that feels ready to chat.</h1>
          <p>
            Join with a polished signup flow designed to match the login page perfectly.
          </p>

          <div className="auth-metrics">
            <div className="metric-card">
              <strong>Clean onboarding</strong>
              <span>Simple form groups, smooth transitions, and focused validation.</span>
            </div>
            <div className="metric-card">
              <strong>Same visual system</strong>
              <span>Shared colors, motion, spacing, and responsive layout across both pages.</span>
            </div>
          </div>
        </div>

        <div className="auth-panel auth-card">
          <div className="auth-card-header">
            <span className="auth-eyebrow">Signup</span>
            <h2>Create account</h2>
            <p>Start your ChatApp journey with a sleek, consistent experience.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-grid-two">
              <label className="auth-field">
                <span>First Name</span>
                <input
                  type="text"
                  id="firstName"
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
                  id="lastName"
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
              <span>Email Address</span>
              <input
                type="email"
                id="email"
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
                  id="password"
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
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Repeat password"
                  className={errors.confirmPassword ? "error" : ""}
                />
                {errors.confirmPassword && (
                  <span className="error-message">{errors.confirmPassword}</span>
                )}
              </label>
            </div>

            <button type="submit" className="auth-button auth-button-primary" disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Sign Up"}
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
