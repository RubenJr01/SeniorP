import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import "../styles/Navigation.css";
import { ACCESS_TOKEN } from "../constants";

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const isAuthenticated =
    typeof window !== "undefined" && Boolean(localStorage.getItem(ACCESS_TOKEN));

  const navClassName = useMemo(() => {
    const classes = ["app-nav"];
    if (location.pathname === "/") {
      classes.push("app-nav--transparent");
    }
    return classes.join(" ");
  }, [location.pathname]);

  return (
    <nav className={navClassName}>
      <div className="app-nav__inner">
        <div
          className="app-nav__brand"
          role="banner"
        >
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
