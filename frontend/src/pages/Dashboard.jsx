import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api";

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
      const suffix = pieces.length ? ` — ${pieces.join(", ")}` : "";
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
        detailParts.length > 0
          ? detailParts.join(", ")
          : "no changes detected";
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
        startDateTime.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
        const endDateTime = new Date(f.endDateTime);
        endDateTime.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
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
    if (!confirm("Delete this event?")) return;
    try {
      await api.delete(`/api/events/${id}/`);
      setEvents((evs) => evs.filter((e) => e.id !== id));
    } catch {
      alert("Delete failed.");
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "2rem auto", padding: "0 1rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <a href="/logout" style={{ fontSize: 14 }}>
          Logout
        </a>
      </header>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Google Calendar</h2>
        {googleMessage && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: 6,
              backgroundColor: googleMessage.type === "success" ? "#ecfdf5" : "#fcebea",
              color: googleMessage.type === "success" ? "#047857" : "#b91c1c",
              marginBottom: "0.75rem",
            }}
          >
            {googleMessage.text}
          </div>
        )}
        {googleLoading ? (
          <p>Checking Google connection…</p>
        ) : googleStatus.connected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <p style={{ margin: 0 }}>
              Connected as <strong>{googleStatus.email}</strong>
              {googleStatus.last_synced_at && (
                <span style={{ display: "block", fontSize: 13, opacity: 0.8 }}>
                  Last sync: {new Date(googleStatus.last_synced_at).toLocaleString()}
                </span>
              )}
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button onClick={syncGoogle} disabled={googleWorking}>
                {googleWorking ? "Working..." : "Sync now"}
              </button>
              <button onClick={disconnectGoogle} disabled={googleWorking}>
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <p style={{ margin: 0 }}>Not connected to Google Calendar.</p>
            <button onClick={connectGoogle} disabled={googleWorking}>
              {googleWorking ? "Working..." : "Connect Google Calendar"}
            </button>
          </div>
        )}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Create Event</h2>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
          <input
            name="title"
            value={form.title}
            onChange={onChange}
            placeholder="Title"
            required
          />
          <textarea
            name="description"
            value={form.description}
            onChange={onChange}
            placeholder="Description (optional)"
            rows={3}
          />
          <label>
            Start:&nbsp;
            {!form.all_day ? (
              <input
                type="datetime-local"
                name="startDateTime"
                value={form.startDateTime}
                onChange={onChange}
                required
              />
            ) : (
              <input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={onChange}
                required
              />
            )}
          </label>
          {!form.all_day && (
            <label>
              End:&nbsp;
              <input
                type="datetime-local"
                name="endDateTime"
                value={form.endDateTime}
                onChange={onChange}
                required
              />
            </label>
          )}
          {form.all_day && (
            <small style={{ color: "#4b5563" }}>
              End of day is applied automatically for all-day events.
            </small>
          )}
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <input
              type="checkbox"
              name="all_day"
              checked={form.all_day}
              onChange={onChange}
            />
            All day
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Add Event"}
          </button>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
        </form>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ marginBottom: "0.5rem" }}>My Events</h2>
        {loading ? (
          <p>Loading...</p>
        ) : events.length === 0 ? (
          <p>No events yet.</p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: "0.75rem",
            }}
          >
            {events.map((ev) => (
              <li
                key={ev.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>{ev.title}</strong>
                    {ev.source !== "local" && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          backgroundColor: "#eef2ff",
                          color: "#3730a3",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {ev.source === "google" ? "Google" : "Synced"}
                      </span>
                    )}
                    {ev.all_day && (
                      <span
                        style={{ marginLeft: 8, fontSize: 12, opacity: 0.75 }}
                      >
                        (All day)
                      </span>
                    )}
                    {ev.description && (
                      <div style={{ fontSize: 14, marginTop: 4 }}>
                        {ev.description}
                      </div>
                    )}
                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                      {new Date(ev.start).toLocaleString()} -{" "}
                      {new Date(ev.end).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(ev.id)}
                    style={{ height: 36 }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
