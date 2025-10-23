import { useEffect, useState } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import "../styles/Form.css";

function Form({
  route,
  method,
  title,
  subtitle,
  submitLabel,
  footer,
  initialEmail = "",
  inviteToken = "",
  disabled = false,
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(initialEmail || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const isLogin = method === "login";
  const heading = title ?? (isLogin ? "Sign in" : "Create account");
  const buttonText = submitLabel ?? (isLogin ? "Continue" : "Create account");
  const eyebrow = isLogin ? "Mission control access" : "Crew onboarding";

  useEffect(() => {
    setEmail(initialEmail || "");
  }, [initialEmail]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (disabled) {
      return;
    }
    setLoading(true);
    setError("");

    try {
      const payload = { username, password };
      if (!isLogin && inviteToken) {
        payload.invite_token = inviteToken;
        if (email) {
          payload.email = email;
        }
      }

      const resp = await api.post(route, payload);
      if (isLogin) {
        localStorage.setItem(ACCESS_TOKEN, resp.data.access);
        localStorage.setItem(REFRESH_TOKEN, resp.data.refresh);
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/login");
      }
    } catch (error) {
      let msg = "Request failed.";
      if (error.response?.data) {
        const data = error.response.data;
        msg = typeof data === "string" ? data : Object.values(data).flat().join(" ");
      } else if (error.message) {
        msg = error.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form-container">
      <div className="form-header">
        <span className="form-eyebrow">{eyebrow}</span>
        <h1>{heading}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      <div className="form-fields">
        <label className="form-field">
          <span className="form-label">Username</span>
          <input
            className="form-input"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter your username"
            autoComplete="username"
            disabled={loading || disabled}
            required
          />
        </label>

        <label className="form-field">
          <span className="form-label">Password</span>
          <input
            className="form-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            disabled={loading || disabled}
            required
          />
        </label>
      </div>

      <button className="form-button" type="submit" disabled={loading || disabled}>
        {loading ? "Processing..." : buttonText}
      </button>

      {error && <p className="form-error">{error}</p>}
      {footer && <div className="form-footer">{footer}</div>}
    </form>
  );
}

export default Form;
