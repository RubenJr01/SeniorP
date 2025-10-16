import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api";
import "../styles/Dashboard.css";

function isoLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date(date);
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

function isoDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function createInitialForm() {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    title: "",
    description: "",
    startDateTime: isoLocal(now),
    endDateTime: isoLocal(inOneHour),
    startDate: isoDate(now),
    all_day: false,
  };
}

export default function Dashboard() {
  const location = useLocation();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(() => createInitialForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [googleStatus, setGoogleStatus] = useState({ connected: false });
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleWorking, setGoogleWorking] = useState(false);
  const [googleMessage, setGoogleMessage] = useState(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/events/");
      setEvents(data);
    } catch {
      setError("Failed to load events.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    try {
      setGoogleLoading(true);
      const { data } = await api.get("/api/google/status/");
      setGoogleStatus({
        connected: data.connected,
        email: data.email,
        last_synced_at: data.last_synced_at,
        scopes: data.scopes,
      });
    } catch {
      setGoogleStatus({ connected: false });
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    loadGoogleStatus();
  }, [loadGoogleStatus]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get("google_status");
    if (!status) {
      return;
    }

    if (status === "success") {
      const imported = Number(params.get("imported") || 0);
      const linked = Number(params.get("linked") || 0);
      const deduped = Number(params.get("deduped") || 0);
      const pieces = [];
      if (imported > 0) {
        pieces.push(`imported ${imported} new event${imported === 1 ? "" : "s"}`);
      }
      if (linked > 0) {
        pieces.push(`linked ${linked} existing event${linked === 1 ? "" : "s"}`);
      }
      if (deduped > 0) {
        pieces.push(`removed ${deduped} duplicate${deduped === 1 ? "" : "s"}`);
      }
      const suffix = pieces.length ? ` - ${pieces.join(", ")}` : "";
      setGoogleMessage({
        type: "success",
        text: `Google Calendar connected${suffix}.`,
      });
      loadGoogleStatus();
      fetchEvents();
    } else {
      const message = params.get("message") || "unknown_error";
      setGoogleMessage({
        type: "error",
        text: `Google Calendar connection failed (${message}).`,
      });
    }
    window.history.replaceState({}, "", location.pathname);
  }, [location, loadGoogleStatus, fetchEvents]);

  const connectGoogle = useCallback(async () => {
    setGoogleWorking(true);
    setGoogleMessage(null);
    try {
      const { data } = await api.post("/api/google/oauth/start/");
      window.location.href = data.auth_url;
    } catch {
      setGoogleWorking(false);
      setGoogleMessage({
        type: "error",
        text: "Could not start Google authorization. Please try again.",
      });
    }
  }, []);

  const syncGoogle = useCallback(async () => {
    setGoogleWorking(true);
    setGoogleMessage(null);
    try {
      const { data } = await api.post("/api/google/sync/");
      const stats = data.stats || {};
      const summaries = [
        ["created", "created"],
        ["updated", "updated"],
        ["deleted", "deleted"],
        ["pushed", "pushed"],
        ["linked_existing", "linked existing"],
        ["deduped", "removed duplicates"],
        ["google_deleted", "deleted in Google"],
      ];
      const detailParts = summaries
        .filter(([key]) => stats[key])
        .map(([key, label]) => `${label} ${stats[key]}`);
      const detailText =
        detailParts.length > 0 ? detailParts.join(", ") : "no changes detected";
      setGoogleMessage({
        type: "success",
        text: `Google Calendar synced (${detailText}).`,
      });
      await fetchEvents();
      await loadGoogleStatus();
    } catch {
      setGoogleMessage({
        type: "error",
        text: "Google sync failed.",
      });
    } finally {
      setGoogleWorking(false);
    }
  }, [fetchEvents, loadGoogleStatus]);

  const disconnectGoogle = useCallback(async () => {
    setGoogleWorking(true);
    setGoogleMessage(null);
    try {
      await api.delete("/api/google/disconnect/");
      setGoogleMessage({
        type: "success",
        text: "Google Calendar disconnected.",
      });
      await loadGoogleStatus();
    } catch {
      setGoogleMessage({
        type: "error",
        text: "Failed to disconnect Google Calendar.",
      });
    } finally {
      setGoogleWorking(false);
    }
  }, [loadGoogleStatus]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => {
      if (name === "all_day") {
        if (checked) {
          return { ...f, all_day: true, startDate: isoDate(f.startDateTime) };
        }
        return { ...f, all_day: false };
      }
      if (name === "startDate") {
        if (!value) {
          return { ...f, startDate: value };
        }
        const base = new Date(value);
        if (Number.isNaN(base.getTime())) {
          return { ...f, startDate: value };
        }
        const startDateTime = new Date(f.startDateTime);
        startDateTime.setFullYear(
          base.getFullYear(),
          base.getMonth(),
          base.getDate(),
        );
        const endDateTime = new Date(f.endDateTime);
        endDateTime.setFullYear(
          base.getFullYear(),
          base.getMonth(),
          base.getDate(),
        );
        return {
          ...f,
          startDate: value,
          startDateTime: isoLocal(startDateTime),
          endDateTime: isoLocal(endDateTime),
        };
      }
      if (name === "startDateTime") {
        let nextEnd = f.endDateTime;
        const newStart = new Date(value);
        if (!Number.isNaN(newStart.getTime())) {
          const currentEnd = new Date(f.endDateTime);
          if (Number.isNaN(currentEnd.getTime()) || currentEnd <= newStart) {
            const bumped = new Date(newStart.getTime() + 60 * 60 * 1000);
            nextEnd = isoLocal(bumped);
          }
        }
        return {
          ...f,
          startDateTime: value,
          endDateTime: nextEnd,
          startDate: value ? isoDate(value) : f.startDate,
        };
      }
      return {
        ...f,
        [name]: type === "checkbox" ? checked : value,
      };
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    let startDate;
    let endDate;

    if (form.all_day) {
      if (!form.startDate) {
        setError("Please choose a date.");
        setSubmitting(false);
        return;
      }
      const day = new Date(form.startDate);
      if (Number.isNaN(day.getTime())) {
        setError("Invalid date selected.");
        setSubmitting(false);
        return;
      }
      day.setHours(0, 0, 0, 0);
      startDate = day;
      endDate = new Date(day);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date(form.startDateTime);
      endDate = new Date(form.endDateTime);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        setError("Please provide valid start and end times.");
        setSubmitting(false);
        return;
      }
      if (endDate < startDate) {
        setError("End must be after start.");
        setSubmitting(false);
        return;
      }
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      all_day: !!form.all_day,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };

    try {
      await api.post("/api/events/", payload);
      setForm(() => createInitialForm());
      await fetchEvents();
    } catch {
      setError("Could not create event.");
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this event?")) return;
    try {
      await api.delete(`/api/events/${id}/`);
      setEvents((evs) => evs.filter((e) => e.id !== id));
    } catch {
      window.alert("Delete failed.");
    }
  };

  const googleScopes = Array.isArray(googleStatus.scopes)
    ? googleStatus.scopes
    : [];
  const hasEvents = events.length > 0;
  const eventCountLabel = hasEvents
    ? `${events.length} ${events.length === 1 ? "event" : "events"}`
    : "";

  return (
    <main className="dashboard">
      <div className="dashboard-shell">
        <header className="dashboard-header">
          <div className="dashboard-heading">
            <h1>Mission Control</h1>
            <p>Plan sorties, sync calendars, and keep everyone aligned.</p>
          </div>
          <a className="dashboard-logout" href="/logout">
            Logout
          </a>
        </header>

        {googleMessage && (
          <div className={`dashboard-banner dashboard-banner--${googleMessage.type}`}>
            {googleMessage.text}
          </div>
        )}

        <div className="dashboard-grid">
          <section className="dashboard-card">
            <div className="dashboard-card-header">
              <h2>Google Calendar</h2>
              <span
                className={`dashboard-status ${
                  googleLoading
                    ? "dashboard-status--pending"
                    : googleStatus.connected
                    ? "dashboard-status--ok"
                    : "dashboard-status--warn"
                }`}
              >
                {googleLoading
                  ? "Checking..."
                  : googleStatus.connected
                  ? "Connected"
                  : "Not connected"}
              </span>
            </div>
            {googleLoading ? (
              <p className="dashboard-muted">Checking Google connection...</p>
            ) : googleStatus.connected ? (
              <>
                <p className="dashboard-body">
                  Connected as <strong>{googleStatus.email}</strong>
                  {googleStatus.last_synced_at && (
                    <span className="dashboard-subtext">
                      Last sync:{" "}
                      {new Date(googleStatus.last_synced_at).toLocaleString()}
                    </span>
                  )}
                </p>
                {googleScopes.length > 0 && (
                  <div className="dashboard-chip-row">
                    {googleScopes.map((scope) => (
                      <span key={scope} className="dashboard-chip">
                        {scope}
                      </span>
                    ))}
                  </div>
                )}
                <div className="dashboard-actions">
                  <button
                    type="button"
                    className="dashboard-button"
                    onClick={syncGoogle}
                    disabled={googleWorking}
                  >
                    {googleWorking ? "Working..." : "Sync now"}
                  </button>
                  <button
                    type="button"
                    className="dashboard-button dashboard-button--secondary"
                    onClick={disconnectGoogle}
                    disabled={googleWorking}
                  >
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="dashboard-muted">
                  Connect your Google Calendar to keep missions aligned across
                  devices.
                </p>
                <button
                  type="button"
                  className="dashboard-button"
                  onClick={connectGoogle}
                  disabled={googleWorking}
                >
                  {googleWorking ? "Working..." : "Connect Google Calendar"}
                </button>
              </>
            )}
          </section>

          <section className="dashboard-card">
            <div className="dashboard-card-header">
              <h2>Create Event</h2>
            </div>
            <form className="dashboard-form" onSubmit={onSubmit}>
              <input
                className="dashboard-input"
                name="title"
                value={form.title}
                onChange={onChange}
                placeholder="Title"
                required
              />
              <textarea
                className="dashboard-textarea"
                name="description"
                value={form.description}
                onChange={onChange}
                placeholder="Description (optional)"
                rows={3}
              />
              <label className="dashboard-label">
                <span>Start</span>
                {!form.all_day ? (
                  <input
                    className="dashboard-input"
                    type="datetime-local"
                    name="startDateTime"
                    value={form.startDateTime}
                    onChange={onChange}
                    required
                  />
                ) : (
                  <input
                    className="dashboard-input"
                    type="date"
                    name="startDate"
                    value={form.startDate}
                    onChange={onChange}
                    required
                  />
                )}
              </label>
              {!form.all_day && (
                <label className="dashboard-label">
                  <span>End</span>
                  <input
                    className="dashboard-input"
                    type="datetime-local"
                    name="endDateTime"
                    value={form.endDateTime}
                    onChange={onChange}
                    required
                  />
                </label>
              )}
              {form.all_day && (
                <p className="dashboard-note">
                  End of day is applied automatically for all-day events.
                </p>
              )}
              <label className="dashboard-check">
                <input
                  type="checkbox"
                  name="all_day"
                  checked={form.all_day}
                  onChange={onChange}
                />
                <span>All day</span>
              </label>
              <button
                className="dashboard-button"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Saving..." : "Add Event"}
              </button>
              {error && <p className="dashboard-error">{error}</p>}
            </form>
          </section>
        </div>

        <section className="dashboard-card">
          <div className="dashboard-card-header">
            <h2>My Events</h2>
            {!loading && hasEvents && (
              <span className="dashboard-muted">{eventCountLabel}</span>
            )}
          </div>
          {loading ? (
            <p className="dashboard-muted">Loading...</p>
          ) : !hasEvents ? (
            <p className="dashboard-empty">
              No events yet. Create your first mission above.
            </p>
          ) : (
            <ul className="dashboard-event-list">
              {events.map((ev) => (
                <li className="dashboard-event" key={ev.id}>
                  <div className="dashboard-event-main">
                    <div className="dashboard-event-header">
                      <strong>{ev.title}</strong>
                      {ev.source !== "local" && (
                        <span
                          className={`dashboard-tag ${
                            ev.source === "google"
                              ? "dashboard-tag--google"
                              : "dashboard-tag--sync"
                          }`}
                        >
                          {ev.source === "google" ? "Google" : "Synced"}
                        </span>
                      )}
                      {ev.all_day && (
                        <span className="dashboard-tag dashboard-tag--muted">
                          All day
                        </span>
                      )}
                    </div>
                    {ev.description && (
                      <p className="dashboard-event-desc">{ev.description}</p>
                    )}
                    <p className="dashboard-event-time">
                      {new Date(ev.start).toLocaleString()} -{" "}
                      {new Date(ev.end).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="dashboard-button dashboard-button--ghost"
                    onClick={() => onDelete(ev.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
