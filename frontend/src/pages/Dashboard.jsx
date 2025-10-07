import { useEffect, useState } from "react";
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

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "",
    description: "",
    start: isoLocal(new Date()),
    end: isoLocal(new Date(new Date().getTime() + 60 * 60 * 1000)),
    all_day: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/events/");
      setEvents(data);
    } catch {
      setError("Failed to load events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      all_day: !!form.all_day,
      start: new Date(form.start).toISOString(),
      end: new Date(form.end).toISOString(),
    };
    if (payload.all_day) {
      const s = new Date(payload.start);
      s.setHours(23, 59, 59, 999);
      payload.end = s.toISOString();
    }

    try {
      await api.post("/api/events/", payload);
      setForm((f) => ({ ...f, title: "", description: "" }));
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
      await api.delete(`/api/event/delete/${id}/`);
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
            <input
              type="datetime-local"
              name="start"
              value={form.start}
              onChange={onChange}
              required
            />
          </label>
          <label>
            End:&nbsp;
            <input
              type="datetime-local"
              name="end"
              value={form.end}
              onChange={onChange}
              required
            />
          </label>
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
