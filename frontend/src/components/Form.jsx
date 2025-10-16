import { useState } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import "../styles/Form.css";

function Form({ route, method, title, subtitle, submitLabel, footer }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const isLogin = method === "login";
  const heading = title ?? (isLogin ? "Sign in" : "Create account");
  const buttonText = submitLabel ?? (isLogin ? "Continue" : "Create account");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const resp = await api.post(route, { username, password });
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
        <h1>{heading}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <input
        className="form-input"
        type="text"
        value={username}
        onChange={(v) => setUsername(v.target.value)}
        placeholder="Username"
        autoComplete="username"
        disabled={loading}
      />
      <input
        className="form-input"
        type="password"
        value={password}
        onChange={(v) => setPassword(v.target.value)}
        placeholder="Password"
        autoComplete={isLogin ? "current-password" : "new-password"}
        disabled={loading}
      />
      <button className="form-button" type="submit" disabled={loading}>
        {loading ? "Loading..." : buttonText}
      </button>
      {error && <p className="form-error">{error}</p>}
      {footer && <div className="form-footer">{footer}</div>}
    </form>
  );
}

export default Form;
