import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import "../styles/Navigation.css";
import { ACCESS_TOKEN } from "../constants";

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const isAuthenticated =
    typeof window !== "undefined" && Boolean(localStorage.getItem(ACCESS_TOKEN));

  const navClassName = useMemo(() => {
    const classes = ["app-nav"];
    if (location.pathname === "/") {
      classes.push("app-nav--transparent");
    }
    if (scrolled) {
      classes.push("app-nav--scrolled");
    }
    return classes.join(" ");
  }, [location.pathname, scrolled]);

  return (
    <nav className={navClassName}>
      <div className="app-nav__inner">
        <div className="app-nav__brand" role="banner">
          V-Cal
        </div>

        <div className="app-nav__links" role="navigation" aria-label="Primary">
          {!isAuthenticated && (
            <NavLink
              to="/"
              className={({ isActive }) =>
                `app-nav__link ${isActive ? "app-nav__link--active" : ""}`
              }
              end
            >
              Home
            </NavLink>
          )}
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `app-nav__link ${isActive ? "app-nav__link--active" : ""}`
            }
          >
            Dashboard
          </NavLink>
          {isAuthenticated && (
            <NavLink
              to="/calendar"
              className={({ isActive }) =>
                `app-nav__link ${isActive ? "app-nav__link--active" : ""}`
              }
            >
              Calendar
            </NavLink>
          )}
          {!isAuthenticated && (
            <NavLink
              to="/register"
              className={({ isActive }) =>
                `app-nav__link ${isActive ? "app-nav__link--active" : ""}`
              }
            >
              Register
            </NavLink>
          )}
        </div>

        <div className="app-nav__actions">
          <button
            type="button"
            className="app-nav__action app-nav__action--primary"
            onClick={() => navigate(isAuthenticated ? "/logout" : "/login")}
          >
            {isAuthenticated ? "Sign out" : "Log in"}
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;
