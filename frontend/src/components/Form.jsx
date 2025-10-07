import { useState } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import "../styles/Form.css";

function Form({ route, method }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const name = method === "login" ? "Login" : "Register";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const resp = await api.post(route, { username, password });
      if (method === "login") {
        localStorage.setItem(ACCESS_TOKEN, resp.data.access);
        localStorage.setItem(REFRESH_TOKEN, resp.data.refresh);
        navigate("/");
      } else {
        navigate("/login");
      }
    } catch (error) {
      alert(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form-container">
      <h1>{name}</h1>
      <input
        className="form-input"
        type="text"
        value={username}
        onChange={(v) => setUsername(v.target.value)}
        placeholder="Username"
        disabled={loading}
      />
      <input
        className="form-input"
        type="password"
        value={password}
        onChange={(v) => setPassword(v.target.value)}
        placeholder="Password"
        disabled={loading}
      />
      <button className="form-button" type="submit" disabled={loading}>
        {loading ? "Loading..." : name}
      </button>
    </form>
  );
}

export default Form;
