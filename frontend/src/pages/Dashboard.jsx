import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api";
import Navigation from "../components/Navigation";
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
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.start) - new Date(b.start),
  );
  const eventCountLabel = hasEvents
    ? `${events.length} ${events.length === 1 ? "mission" : "missions"}`
    : "Chronological view of your activity.";

  const now = new Date();
  const nextEvent = sortedEvents.find((event) => new Date(event.end) > now);
  const nextEventTitle = nextEvent ? nextEvent.title : "No missions scheduled";
  const nextEventSummary = nextEvent
    ? nextEvent.description || "Keep crew briefed and ready."
    : "Create an event to populate your mission timeline.";
  const nextEventStart = nextEvent
    ? new Date(nextEvent.start).toLocaleString()
    : "Awaiting scheduling";
  const nextEventEnd = nextEvent
    ? new Date(nextEvent.end).toLocaleString()
    : "";

  const googleStatusLabel = googleLoading
    ? "Checking..."
    : googleStatus.connected
    ? "Connected"
    : "Not connected";
  const googleStatusTone = googleLoading
    ? "pending"
    : googleStatus.connected
    ? "positive"
    : "warn";

  return (
    <>
      <Navigation />
      <main className="dashboard">
        <div className="dashboard-shell">

        <section className="dashboard-hero">
          <div className="dashboard-hero-text">
            <h1>Coordinate sorties with precision.</h1>
            <p>Plan missions, sync calendars, and keep every crew member aligned.</p>
            {googleMessage && (
              <div className={`dashboard-toast dashboard-toast--${googleMessage.type}`}>
                {googleMessage.text}
              </div>
            )}
          </div>
          <div className="dashboard-hero-card">
            <span className="dashboard-hero-label">Next mission</span>
            <h3>{nextEventTitle}</h3>
            <p>{nextEventSummary}</p>
            <div className="dashboard-hero-meta">
              <span>{nextEventStart}</span>
              {nextEventEnd && <span>{nextEventEnd}</span>}
            </div>
          </div>
        </section>

        <section className="dashboard-stats">
          <article className="dashboard-stat">
            <span className="dashboard-stat-label">Scheduled missions</span>
            <span className="dashboard-stat-value">{events.length}</span>
            <p>{hasEvents ? "Active sorties on the board." : "No missions yet."}</p>
          </article>
          <article className="dashboard-stat">
            <span className="dashboard-stat-label">Google sync</span>
            <span className={`dashboard-chip dashboard-chip--${googleStatusTone}`}>
              {googleStatusLabel}
            </span>
            <p>
              {googleStatus.connected
                ? `Connected as ${googleStatus.email}`
                : "Link Google Calendar to share updates instantly."}
            </p>
          </article>
          <article className="dashboard-stat">
            <span className="dashboard-stat-label">Last sync</span>
            <span className="dashboard-stat-value">
              {googleStatus.connected && googleStatus.last_synced_at
                ? new Date(googleStatus.last_synced_at).toLocaleString()
                : "—"}
            </span>
            <p>Keep missions aligned across every device.</p>
          </article>
        </section>

        <div className="dashboard-body">
          <div className="dashboard-column">
            <section className="dashboard-panel dashboard-panel--accent">
              <div className="dashboard-panel-heading">
                <div>
                  <h2>Google Calendar</h2>
                  <p>Sync sorties with the calendars your crews already use.</p>
                </div>
                <span className={`dashboard-chip dashboard-chip--${googleStatusTone}`}>
                  {googleStatusLabel}
                </span>
              </div>
              {googleLoading ? (
                <p className="dashboard-muted">Checking Google connection...</p>
              ) : googleStatus.connected ? (
                <>
                  <div className="dashboard-panel-body">
                    <p className="dashboard-paragraph">
                      Connected as <strong>{googleStatus.email}</strong>
                    </p>
                    {googleStatus.last_synced_at && (
                      <p className="dashboard-paragraph">
                        Last sync:{" "}
                        {new Date(googleStatus.last_synced_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {googleScopes.length > 0 && (
                    <div className="dashboard-chip-row">
                      {googleScopes.map((scope) => (
                        <span
                          key={scope}
                          className="dashboard-chip dashboard-chip--outline"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="dashboard-button-row">
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
                      className="dashboard-button dashboard-button--ghost"
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
                    Connect your Google Calendar to broadcast updates automatically.
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

            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <div>
                  <h2>Create mission</h2>
                  <p>Capture sortie details and share instantly with the team.</p>
                </div>
              </div>
              <form className="dashboard-form" onSubmit={onSubmit}>
                <label className="dashboard-label">
                  <span>Title</span>
                  <input
                    className="dashboard-input"
                    name="title"
                    value={form.title}
                    onChange={onChange}
                    placeholder="Mission title"
                    required
                  />
                </label>
                <label className="dashboard-label">
                  <span>Description</span>
                  <textarea
                    className="dashboard-input"
                    name="description"
                    value={form.description}
                    onChange={onChange}
                    placeholder="Description (optional)"
                    rows={3}
                  />
                </label>
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
                <button className="dashboard-button" type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Add mission"}
                </button>
                {error && <p className="dashboard-error">{error}</p>}
              </form>
            </section>
          </div>

          <section className="dashboard-panel dashboard-panel--list">
            <div className="dashboard-panel-heading">
              <div>
                <h2>Mission log</h2>
                <p>{!loading && hasEvents ? eventCountLabel : "Chronological view of your activity."}</p>
              </div>
            </div>
            {loading ? (
              <p className="dashboard-muted">Loading...</p>
            ) : !hasEvents ? (
              <div className="dashboard-empty">
                <h3>No missions yet</h3>
                <p>Create your first event to populate the mission log.</p>
              </div>
            ) : (
              <ul className="dashboard-event-list">
                {sortedEvents.map((ev) => (
                  <li className="dashboard-event" key={ev.id}>
                    <div className="dashboard-event-timeline">
                      <span className="dashboard-event-date">
                        {new Date(ev.start).toLocaleDateString()}
                      </span>
                      <span className="dashboard-event-time">
                        {new Date(ev.start).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        -{" "}
                        {new Date(ev.end).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="dashboard-event-content">
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
        </div>
      </main>
    </>
  );
}
