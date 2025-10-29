import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../styles/Navigation.css";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import api from "../api";

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef(null);
  const menuToggleRef = useRef(null);
  const notificationsRef = useRef(null);
  const notificationsToggleRef = useRef(null);
  const autoCloseTimeoutRef = useRef(null);
  const AUTO_CLOSE_DELAY = 5000;

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

  useEffect(() => {
    setMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimeoutRef.current) {
      clearTimeout(autoCloseTimeoutRef.current);
      autoCloseTimeoutRef.current = null;
    }
  }, []);

  const startAutoCloseTimer = useCallback(() => {
    clearAutoCloseTimer();
    autoCloseTimeoutRef.current = setTimeout(() => {
      setNotificationsOpen(false);
    }, AUTO_CLOSE_DELAY);
  }, [clearAutoCloseTimer]);

  useEffect(() => clearAutoCloseTimer, [clearAutoCloseTimer]);

  useEffect(() => {
    if (notificationsOpen) {
      startAutoCloseTimer();
    } else {
      clearAutoCloseTimer();
    }
  }, [notificationsOpen, startAutoCloseTimer, clearAutoCloseTimer]);

  useEffect(() => {
    if (!menuOpen && !notificationsOpen) return undefined;

    const handleClick = (event) => {
      const target = event.target;

      const clickedMenuToggle = menuToggleRef.current?.contains(target);
      const clickedMenuPanel = menuRef.current?.contains(target);
      if (!clickedMenuPanel && !clickedMenuToggle) {
        setMenuOpen(false);
      }

      const clickedNotificationsToggle = notificationsToggleRef.current?.contains(target);
      const clickedNotificationsPanel = notificationsRef.current?.contains(target);
      if (!clickedNotificationsPanel && !clickedNotificationsToggle) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [menuOpen, notificationsOpen]);

  const isAuthenticated =
    typeof window !== "undefined" && Boolean(localStorage.getItem(ACCESS_TOKEN));

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setNotificationsLoading(false);
      return;
    }
    try {
      setNotificationsLoading(true);
      const { data } = await api.get("/api/notifications/?limit=10");
      setNotifications(data.results || []);
      setUnreadCount(data.unread_count || 0);
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    } finally {
      setNotificationsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchNotifications();
    if (!isAuthenticated) {
      return undefined;
    }
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications, isAuthenticated]);

  useEffect(() => {
    if (!notificationsOpen || unreadCount === 0 || !isAuthenticated) {
      return;
    }
    const markRead = async () => {
      try {
        await api.post("/api/notifications/", { all: true });
        await fetchNotifications();
      } catch (error) {
        console.error("Failed to mark notifications read", error);
      }
    };
    markRead();
  }, [notificationsOpen, unreadCount, fetchNotifications, isAuthenticated]);

  const notificationLabels = useMemo(
    () => ({
      event_created: "Mission scheduled",
      event_updated: "Mission updated",
      event_deleted: "Mission removed",
      brightspace_import: "Brightspace import",
    }),
    [],
  );

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

  const handlePanelMouseEnter = useCallback(() => {
    clearAutoCloseTimer();
  }, [clearAutoCloseTimer]);

  const handlePanelMouseLeave = useCallback(() => {
    startAutoCloseTimer();
  }, [startAutoCloseTimer]);

  const handlePanelFocus = useCallback(() => {
    clearAutoCloseTimer();
  }, [clearAutoCloseTimer]);

  const handlePanelBlur = useCallback(
    (event) => {
      if (!notificationsRef.current?.contains(event.relatedTarget)) {
        startAutoCloseTimer();
      }
    },
    [startAutoCloseTimer],
  );

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
          {isAuthenticated && (
            <NavLink
              to="/parse-email"
              className={({ isActive }) =>
                `app-nav__link ${isActive ? "app-nav__link--active" : ""}`
              }
            >
              📧 Parse Email
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
          {isAuthenticated && (
            <div
              className="app-nav__notifications-wrap"
              onMouseEnter={() => {
                setNotificationsOpen(true);
                setMenuOpen(false);
              }}
              onMouseLeave={() => setNotificationsOpen(false)}
            >
              <button
                type="button"
                ref={notificationsToggleRef}
                className={`app-nav__notifications-toggle${
                  notificationsOpen ? " app-nav__notifications-toggle--open" : ""
                }`}
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setMenuOpen(false);
                }}
                aria-haspopup="true"
                aria-expanded={notificationsOpen}
                aria-controls="app-nav-notifications"
                aria-label="View notifications"
              >
                <svg
                  className="app-nav__notifications-icon"
                  viewBox="0 0 24 24"
                  role="presentation"
                  focusable="false"
                  aria-hidden="true"
                >
                  <path d="M12 3a6 6 0 0 0-6 6v3.382l-.943 1.887A1 1 0 0 0 6 16h12a1 1 0 0 0 .943-1.731L18 12.382V9a6 6 0 0 0-6-6Z" />
                  <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="app-nav__notifications-badge" aria-hidden="true">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <div
                id="app-nav-notifications"
                ref={notificationsRef}
                className={`app-nav__notifications-panel${
                  notificationsOpen ? " app-nav__notifications-panel--open" : ""
                }`}
                role="status"
                tabIndex={-1}
                onMouseEnter={handlePanelMouseEnter}
                onMouseLeave={handlePanelMouseLeave}
                onFocus={handlePanelFocus}
                onBlur={handlePanelBlur}
              >
                <div className="app-nav__notifications-header">
                  <span>Notifications</span>
                  {notificationsLoading && (
                    <span className="app-nav__notifications-subtle">Refreshing…</span>
                  )}
                </div>
                {notificationsLoading && notifications.length === 0 ? (
                  <p className="app-nav__notifications-empty">Loading…</p>
                ) : notifications.length === 0 ? (
                  <p className="app-nav__notifications-empty">You are all caught up.</p>
                ) : (
                  <ul className="app-nav__notifications-list">
                    {notifications.map((note) => (
                      <li key={note.id} className="app-nav__notifications-item">
                        <div className="app-nav__notifications-meta">
                          <span className="app-nav__notifications-type">
                            {notificationLabels[note.type] || note.type.replace(/_/g, " ")}
                          </span>
                          <time dateTime={note.created_at}>
                            {new Date(note.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                        <strong>{note.title}</strong>
                        {note.message && <p>{note.message}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <button
            type="button"
            ref={menuToggleRef}
            className={`app-nav__menu-toggle${menuOpen ? " app-nav__menu-toggle--open" : ""}`}
            onClick={() => {
              setMenuOpen((open) => !open);
              setNotificationsOpen(false);
            }}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-controls="app-nav-popout"
            aria-label="Open menu"
          >
            <span className="app-nav__menu-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
          <div
            id="app-nav-popout"
            ref={menuRef}
            className={`app-nav__popout${menuOpen ? " app-nav__popout--open" : ""}`}
            role="menu"
          >
            <button
              type="button"
              className="app-nav__popout-item"
              onClick={() => {
                setMenuOpen(false);
              }}
              role="menuitem"
            >
              Account
            </button>
            <button
              type="button"
              className="app-nav__popout-item"
              onClick={() => {
                setMenuOpen(false);
              }}
              role="menuitem"
            >
              Settings
            </button>
            <button
              type="button"
              className="app-nav__popout-item"
              onClick={() => {
                setMenuOpen(false);
              }}
              role="menuitem"
            >
              About
            </button>
            <button
              type="button"
              className="app-nav__popout-item"
              onClick={() => {
                setMenuOpen(false);
                setNotificationsOpen(false);
                localStorage.removeItem(ACCESS_TOKEN);
                localStorage.removeItem(REFRESH_TOKEN);
                navigate("/");
              }}
              role="menuitem"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;
