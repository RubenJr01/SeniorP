import { Navigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import api from "../api";
import { REFRESH_TOKEN, ACCESS_TOKEN } from "../constants";
import { useState, useEffect } from "react";

// Custom front-end protection
function ProtectedRoute({ children }) {
  const [isAuthorized, setIsAuthorized] = useState(null);

  useEffect(() => {
    auth().catch(() => setIsAuthorized(false));
  }, []);

  // Getting refresh token, TRY to send response to root, with token, which should give back another access token
  const refreshToken = async () => {
    const storedRefresh = localStorage.getItem(REFRESH_TOKEN);
    if (!storedRefresh) {
      localStorage.removeItem(ACCESS_TOKEN);
      localStorage.removeItem(REFRESH_TOKEN);
      setIsAuthorized(false);
      return;
    }
    try {
      const resp = await api.post("/api/token/refresh/", {
        refresh: storedRefresh,
      });
      if (resp.status === 200) {
        localStorage.setItem(ACCESS_TOKEN, resp.data.access);
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
      }
    } catch (error) {
      console.error(error);
      localStorage.removeItem(ACCESS_TOKEN);
      localStorage.removeItem(REFRESH_TOKEN);
      setIsAuthorized(false);
    }
  };

  // Need to check if token is valid/expired
  const auth = async () => {
    const token = localStorage.getItem(ACCESS_TOKEN);
    if (!token) {
      setIsAuthorized(false);
      return;
    }
    let decoded;
    try {
      decoded = jwtDecode(token);
    } catch (error) {
      console.error("Failed to decode access token", error);
      localStorage.removeItem(ACCESS_TOKEN);
      localStorage.removeItem(REFRESH_TOKEN);
      setIsAuthorized(false);
      return;
    }
    const tokenExpiration = decoded.exp;
    const now = Date.now() / 1000;

    if (tokenExpiration < now) {
      await refreshToken();
    } else {
      setIsAuthorized(true);
    }
  };

  if (isAuthorized === null) {
    return <div>Loading...</div>;
  }

  return isAuthorized ? children : <Navigate to="/login" />;
}

export default ProtectedRoute;
